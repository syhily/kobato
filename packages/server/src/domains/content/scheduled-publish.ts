import type { Database } from '@kobato/db/database'

import { page as pageMetaTable } from '@kobato/db/schema/page'
import { post as postMetaTable } from '@kobato/db/schema/post'
import { invalidateContent } from '@kobato/server/domains/content/invalidate'
import { liveContentWhere, type LiveContentColumns } from '@kobato/server/domains/content/schemas/live-gate'
import { jobDb, nudgeRegisteredJob, registerJob } from '@kobato/server/infra/job-registry'
import { getLogger } from '@kobato/server/infra/logger'
import { and, asc, gt } from 'drizzle-orm'

const log = getLogger('content.scheduled-publish')

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
  const next = findNextScheduledPublishAt(jobDb())
  if (next === null) {
    return null
  }
  return Math.max(next.getTime() - Date.now(), 0)
}

function runScheduledPublish(): void {
  invalidateContent({ entity: 'post' })
  invalidateContent({ entity: 'page' })
  log.info('Scheduled publish reached; public caches invalidated')
}

registerJob({
  name: 'content.scheduled-publish',
  task: { key: 'scheduled-publish', recordHistory: true },
  nextDelayMs: nextScheduledPublishDelayMs,
  run: runScheduledPublish,
})

export function rescheduleScheduledPublish(): void {
  nudgeRegisteredJob('content.scheduled-publish')
}
