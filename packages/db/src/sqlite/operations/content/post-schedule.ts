import type { Database } from '@kobato/db/sqlite/database'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { liveEntityWhere } from '@kobato/db/sqlite/operations/content/entity-meta'
import { page as pageMetaTable } from '@kobato/db/sqlite/schema/page'
import { post as postMetaTable } from '@kobato/db/sqlite/schema/post'
import { and, asc, count, sql } from 'drizzle-orm'

/**
 * The earliest future publish instant across live-gated posts and pages (scheduled publish job wake-up).
 */
export function findNextScheduledPublishAt(db: Database): Date | null {
  const sdb = sqliteOf(db)
  const now = new Date()
  const nextPost = sdb
    .select({ publishedAt: postMetaTable.publishedAt })
    .from(postMetaTable)
    .where(
      and(
        liveEntityWhere(postMetaTable, { includeScheduled: true }),
        sql`${postMetaTable.publishedAt} > ${now.getTime()}`,
      ),
    )
    .orderBy(asc(postMetaTable.publishedAt))
    .limit(1)
    .all()[0]
  const nextPage = sdb
    .select({ publishedAt: pageMetaTable.publishedAt })
    .from(pageMetaTable)
    .where(
      and(
        liveEntityWhere(pageMetaTable, { includeScheduled: true }),
        sql`${pageMetaTable.publishedAt} > ${now.getTime()}`,
      ),
    )
    .orderBy(asc(pageMetaTable.publishedAt))
    .limit(1)
    .all()[0]
  const candidates = [nextPost?.publishedAt, nextPage?.publishedAt].filter((at): at is Date => at !== undefined)
  if (candidates.length === 0) {
    return null
  }
  return new Date(Math.min(...candidates.map((at) => at.getTime())))
}

export interface LivePostReindexRow {
  id: number
  title: string
  summary: string
  publishedRevisionId: number | null
}

/**
 * One reindex batch of live posts (scheduled included) in id order, plus the total live count.
 */
export async function listLivePostReindexBatch(
  db: Database,
  offset: number,
  limit: number,
): Promise<{ rows: LivePostReindexRow[]; total: number }> {
  const sdb = sqliteOf(db)
  const liveIncludingScheduled = liveEntityWhere(postMetaTable, { includeScheduled: true })
  const rows = await sdb
    .select({
      id: postMetaTable.id,
      title: postMetaTable.title,
      summary: postMetaTable.summary,
      publishedRevisionId: postMetaTable.publishedRevisionId,
    })
    .from(postMetaTable)
    .where(liveIncludingScheduled)
    .orderBy(postMetaTable.id)
    .limit(limit)
    .offset(offset)
  const totalRows = await sdb.select({ count: count() }).from(postMetaTable).where(liveIncludingScheduled)
  return { rows, total: totalRows[0].count }
}
