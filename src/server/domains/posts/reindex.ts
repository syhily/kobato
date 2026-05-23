import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm'

import type { PortableTextBody } from '@/shared/pt/schema'

import { indexPost } from '@/server/domains/posts/indexer'
import { db } from '@/server/infra/db/pool'
import { content } from '@/server/infra/db/schema/content'
import { post } from '@/server/infra/db/schema/post'
import { getLogger } from '@/server/infra/logger'

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
 * Rebuild the search index for published posts in batch.
 *
 * When `batchSize` is omitted the entire set is processed in one call.
 * Returns `nextOffset` so callers can drive pagination until it is null.
 */
export async function reindexSearchBatch(input: ReindexBatchInput = {}): Promise<ReindexBatchResult> {
  const rows = await db
    .select({
      id: post.id,
      title: post.title,
      summary: post.summary,
      publishedRevisionId: post.publishedRevisionId,
    })
    .from(post)
    .where(and(isNull(post.deletedAt), eq(post.published, true), isNotNull(post.publishedRevisionId)))
    .orderBy(post.id)

  const total = rows.length

  const useBatching = input.batchSize !== undefined || input.offset !== undefined
  const offset = input.offset ?? 0
  const batchSize = input.batchSize ?? total
  const batch = useBatching ? rows.slice(offset, offset + batchSize) : rows

  const revisionIds = batch.map((r) => r.publishedRevisionId!).filter(Boolean)
  const contents = revisionIds.length > 0 ? await db.select().from(content).where(inArray(content.id, revisionIds)) : []
  const contentMap = new Map(contents.map((c) => [c.id, c]))

  let processed = 0
  let failed = 0
  for (const row of batch) {
    const rev = contentMap.get(row.publishedRevisionId!)
    if (rev) {
      try {
        await indexPost(row.id, row.title, row.summary, rev.body as PortableTextBody)
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
