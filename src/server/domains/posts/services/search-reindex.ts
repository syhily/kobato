import { count, inArray } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'

import { livePostWhere } from '@/server/domains/posts/live-gate'
import { indexPost } from '@/server/domains/posts/services/search-index'
import { content } from '@/server/infra/db/schema/content'
import { post } from '@/server/infra/db/schema/post'
import { getLogger } from '@/server/infra/logger'
import { portableTextBodySchema } from '@/shared/pt/schema'

const log = getLogger('search.reindex')

export interface ReindexBatchInput {
  offset?: number
  batchSize?: number
}

export interface ReindexBatchResult {
  processed: number
  failed: number
  total: number
  nextOffset: number | null
}

/**
 * Rebuild the search index for live posts in `batchSize` batches (default
 * 50); without `offset` only the first batch runs, `nextOffset: null`.
 */
export async function reindexSearchBatch(db: Database, input: ReindexBatchInput = {}): Promise<ReindexBatchResult> {
  const useBatching = input.batchSize !== undefined || input.offset !== undefined
  const offset = input.offset ?? 0
  const batchSize = input.batchSize ?? 50

  // Index scheduled rows too — the query-time gate exposes them at `publishedAt`.
  const liveIncludingScheduled = livePostWhere({ includeScheduled: true })

  const rows = await db
    .select({
      id: post.id,
      title: post.title,
      summary: post.summary,
      publishedRevisionId: post.publishedRevisionId,
    })
    .from(post)
    .where(liveIncludingScheduled)
    .orderBy(post.id)
    .limit(batchSize)
    .offset(offset)

  const totalRows = await db.select({ count: count() }).from(post).where(liveIncludingScheduled)
  const total = totalRows[0].count

  const batch = rows

  const revisionIds = batch.map((r) => r.publishedRevisionId!).filter(Boolean)
  const contents = revisionIds.length > 0 ? await db.select().from(content).where(inArray(content.id, revisionIds)) : []
  const contentMap = new Map(contents.map((c) => [c.id, c]))

  let processed = 0
  let failed = 0
  for (const row of batch) {
    const rev = contentMap.get(row.publishedRevisionId!)
    if (rev) {
      try {
        const body = portableTextBodySchema.safeParse(rev.body)
        if (!body.success) {
          throw new Error('Invalid body format')
        }
        await indexPost(db, row.id, row.title, row.summary, body.data)
        processed++
      } catch (err) {
        log.error('Index post failed', {
          postId: String(row.id),
          title: row.title,
          error: err instanceof Error ? err.message : String(err),
        })
        failed++
      }
    }
  }

  const nextOffset = useBatching && offset + batch.length < total ? offset + batch.length : null

  return { processed, failed, total, nextOffset }
}
