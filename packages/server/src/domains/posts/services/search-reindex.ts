import type { Database } from '@kobato/db/database'
import type { ContentRow } from '@kobato/db/types'

import { findContentsByIds } from '@kobato/db/operations/entity-revision'
import { listLivePostReindexBatch } from '@kobato/db/operations/post'
import { indexPostFromRevision } from '@kobato/server/domains/posts/services/search-index'
import { getLogger } from '@kobato/server/infra/logger'

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

export async function reindexSearchBatch(db: Database, input: ReindexBatchInput = {}): Promise<ReindexBatchResult> {
  const useBatching = input.batchSize !== undefined || input.offset !== undefined
  const offset = input.offset ?? 0
  const batchSize = input.batchSize ?? 50

  const { rows: batch, total } = await listLivePostReindexBatch(db, offset, batchSize)

  const revisionIds = batch.map((r) => r.publishedRevisionId!).filter(Boolean)
  const contents = revisionIds.length > 0 ? await findContentsByIds(db, revisionIds) : []
  const contentMap = new Map<number, ContentRow>(contents.map((c) => [c.id, c]))

  let processed = 0
  let failed = 0
  for (const row of batch) {
    const rev = contentMap.get(row.publishedRevisionId!)
    if (rev) {
      try {
        const indexed = await indexPostFromRevision(db, row.id, row.title, row.summary, rev)
        if (!indexed) {
          throw new Error('revision body is not a Lexical state')
        }
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

export async function reindexSearchToCompletion(
  db: Database,
): Promise<{ processed: number; failed: number; total: number }> {
  let offset = 0
  let processed = 0
  let failed = 0
  let total = 0
  for (;;) {
    const batch = await reindexSearchBatch(db, { offset, batchSize: 50 })
    processed += batch.processed
    failed += batch.failed
    total = batch.total
    if (batch.nextOffset === null) {
      break
    }
    offset = batch.nextOffset
  }
  return { processed, failed, total }
}
