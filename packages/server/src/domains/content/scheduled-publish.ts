import type { Database } from '@kobato/server/infra/db/database'

import { invalidateContent } from '@kobato/server/domains/content/invalidate'
import { liveContentWhere, type LiveContentColumns } from '@kobato/server/domains/content/schemas/live-gate'
import { page as pageMetaTable } from '@kobato/server/infra/db/schema/page'
import { post as postMetaTable } from '@kobato/server/infra/db/schema/post'
import { getLogger } from '@kobato/server/infra/logger'
import { scheduleJob, type ScheduledJob } from '@kobato/server/infra/scheduler-utils'
import { and, asc, gt } from 'drizzle-orm'

const log = getLogger('content.scheduled-publish')

// The post/page live-gate modules bind these same structs for outside
// callers; this module sits INSIDE the content domain (posts and pages
// both depend on it), so importing either binding would close a
// content ↔ entity import cycle. Binding the shared base directly here
// keeps a single gate implementation — see content/schemas/live-gate.ts.
const postLiveColumns = {
  deletedAt: postMetaTable.deletedAt,
  published: postMetaTable.published,
  publishedRevisionId: postMetaTable.publishedRevisionId,
  publishedAt: postMetaTable.publishedAt,
} satisfies LiveContentColumns

const pageLiveColumns = {
  deletedAt: pageMetaTable.deletedAt,
  published: pageMetaTable.published,
  publishedRevisionId: pageMetaTable.publishedRevisionId,
  publishedAt: pageMetaTable.publishedAt,
} satisfies LiveContentColumns

// The db getter is injected by the composition root
// (`@/server/bootstrap/db-lifecycle`, which imports this module) at wire
// time — same injection discipline as `wireBackupScheduler`: the getter
// is invoked when the job evaluates, so a recreated handle (restore
// completion) is picked up without being captured in module state.
let resolveDb: (() => Database) | null = null
let job: ScheduledJob | null = null

export function wireScheduledPublishScheduler(deps: { getDb: () => Database }): void {
  resolveDb = deps.getDb
}

/**
 * The earliest future `publishedAt` among promoted (published, revision
 * attached, not soft-deleted) posts AND pages — the next moment the
 * public surface changes on its own. Pages share the scheduling
 * semantics through the same live gate, so both tables feed the timer.
 */
// Sync (node:sqlite): the scheduleJob seam's nextDelayMs is sync.
function findNextScheduledPublishAt(db: Database): Date | null {
  const now = new Date()
  const nextPost = db
    .select({ publishedAt: postMetaTable.publishedAt })
    .from(postMetaTable)
    .where(and(liveContentWhere(postLiveColumns, { includeScheduled: true }), gt(postMetaTable.publishedAt, now)))
    .orderBy(asc(postMetaTable.publishedAt))
    .limit(1)
    .all()[0]
  const nextPage = db
    .select({ publishedAt: pageMetaTable.publishedAt })
    .from(pageMetaTable)
    .where(and(liveContentWhere(pageLiveColumns, { includeScheduled: true }), gt(pageMetaTable.publishedAt, now)))
    .orderBy(asc(pageMetaTable.publishedAt))
    .limit(1)
    .all()[0]
  const candidates = [nextPost?.publishedAt, nextPage?.publishedAt].filter((at): at is Date => at !== undefined)
  if (candidates.length === 0) {
    return null
  }
  return new Date(Math.min(...candidates.map((at) => at.getTime())))
}

function nextScheduledPublishDelayMs(): number | null {
  if (!resolveDb) {
    // Suspended until the composition root wires the db getter — the seam
    // re-evaluates periodically, so wiring late still takes effect.
    return null
  }
  const next = findNextScheduledPublishAt(resolveDb())
  if (next === null) {
    // Nothing scheduled: suspend. The seam keeps re-evaluating and every
    // content write path nudges `rescheduleScheduledPublish`, so a newly
    // scheduled row arms the timer promptly.
    return null
  }
  // Clamped at 0: the row went due between arming and firing — run now.
  return Math.max(next.getTime() - Date.now(), 0)
}

// Sync (node:sqlite): invalidateContent is sync.
function runScheduledPublish(): void {
  if (!resolveDb) {
    throw new Error('scheduled-publish job fired before wireScheduledPublishScheduler')
  }
  const db = resolveDb()
  // The timer fired at the next scheduled row's `publishedAt` — that row
  // is live as of now. Both entities invalidate: the two events are
  // idempotent and the post event is a near-superset (only the page-only
  // case makes the second call meaningful). No search reindex here: the
  // corpus already contains scheduled posts (indexed at publish time,
  // gated at query time — see posts/services/search-reindex), so the
  // `searchResult` counter bump inside invalidateContent IS the reindex.
  invalidateContent(db, { entity: 'post' })
  invalidateContent(db, { entity: 'page' })
  log.info('Scheduled publish reached; public caches invalidated')
}

export function scheduleNextScheduledPublish(): void {
  job ??= scheduleJob({
    name: 'content.scheduled-publish',
    nextDelayMs: nextScheduledPublishDelayMs,
    run: runScheduledPublish,
  })
  job.reschedule()
}

/**
 * Nudge from the content write paths — anywhere `publishedAt` or the
 * promoted set can change (publish, meta update, unpublish, delete,
 * restore). Create is the one mutation that doesn't call this: a fresh
 * row is always `published: false`, so it can never be the next
 * scheduled one. No-op until the composition root starts the job, so
 * entity mutations in unit tests never arm a real timer.
 */
export function rescheduleScheduledPublish(): void {
  job?.reschedule()
}
