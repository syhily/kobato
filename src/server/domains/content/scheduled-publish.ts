import { and, asc, gt } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'

import { invalidateContent } from '@/server/domains/content/invalidate'
import { liveContentWhere, type LiveContentColumns } from '@/server/domains/content/schemas/live-gate'
import { page as pageMetaTable } from '@/server/infra/db/schema/page'
import { post as postMetaTable } from '@/server/infra/db/schema/post'
import { getLogger } from '@/server/infra/logger'
import { scheduleJob, type ScheduledJob } from '@/server/infra/scheduler-utils'

const log = getLogger('content.scheduled-publish')

// Importing either entity's live-gate binding here would close a
// content ↔ entity import cycle — bind the shared base instead.
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

// Wired by the composition root; the getter is invoked at evaluate time,
// so a recreated handle (restore completion) is picked up.
let resolveDb: (() => Database) | null = null
let job: ScheduledJob | null = null

export function wireScheduledPublishScheduler(deps: { getDb: () => Database }): void {
  resolveDb = deps.getDb
}

/**
 * The earliest future `publishedAt` among promoted posts AND pages —
 * the next moment the public surface changes on its own.
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
    // Suspended until wired; the seam re-evaluates, so late wiring still takes effect.
    return null
  }
  const next = findNextScheduledPublishAt(resolveDb())
  if (next === null) {
    // Nothing scheduled: suspend — every content write nudges `rescheduleScheduledPublish`.
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
  // The row is live as of now; invalidate both entities (idempotent).
  // No extra search reindex — the `searchResult` bump covers it.
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
 * Nudge from every content write path that can move the next scheduled
 * row. No-op until the composition root starts the job.
 */
export function rescheduleScheduledPublish(): void {
  job?.reschedule()
}
