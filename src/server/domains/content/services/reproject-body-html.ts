import { count, eq } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'

import { content } from '@/server/infra/db/schema/content'
import { getLogger } from '@/server/infra/logger'
import { computeBodyProjections } from '@/server/infra/pt/lexical-projection'
import { lexicalEditorStateSchema } from '@/shared/lexical/schema'

// The admin "重建文章缓存" recovery hatch (dashboard button →
// `/admin/renders/reproject-bodies`): re-derives the three R9b projection
// columns (`bodyHtml` / `bodyText` / `bodyHtmlFeed`) of every `content`
// revision row from its stored Lexical `body` — the repair path when a
// renderer-side change (card markup, sanitize allowlist, projection-state
// transform) leaves the saved projections stale. Only drifted rows are
// written, and like the R15 backfill the write touches neither `updatedAt`
// nor `clientRevisionToken` (a re-projection is not an edit). Rows still
// holding a legacy PortableText body count as failed — the R15 backfill
// owns their conversion (and re-derives the projections on the way).

const log = getLogger('content.reproject-body-html')

export interface ReprojectBodyHtmlBatchInput {
  offset?: number
  batchSize?: number
}

export interface ReprojectBodyHtmlBatchResult {
  /** Rows whose projections recomputed cleanly (rewritten or already current). */
  processed: number
  failed: number
  /** Processed rows whose stored columns had drifted and were updated. */
  rewritten: number
  total: number
  nextOffset: number | null
}

/**
 * Rebuild the body projections in `batchSize` batches (default 50); without
 * `offset` only the first batch runs, `nextOffset: null`.
 */
export async function reprojectBodyHtmlBatch(
  db: Database,
  input: ReprojectBodyHtmlBatchInput = {},
): Promise<ReprojectBodyHtmlBatchResult> {
  const useBatching = input.batchSize !== undefined || input.offset !== undefined
  const offset = input.offset ?? 0
  const batchSize = input.batchSize ?? 50

  const rows = await db
    .select({
      id: content.id,
      type: content.type,
      ownerId: content.ownerId,
      revisionNo: content.revisionNo,
      body: content.body,
      bodyHtml: content.bodyHtml,
      bodyText: content.bodyText,
      bodyHtmlFeed: content.bodyHtmlFeed,
    })
    .from(content)
    .orderBy(content.id)
    .limit(batchSize)
    .offset(offset)

  const totalRows = await db.select({ count: count() }).from(content)
  const total = totalRows[0].count

  let processed = 0
  let failed = 0
  let rewritten = 0
  for (const row of rows) {
    try {
      const parsed = lexicalEditorStateSchema.safeParse(row.body)
      if (!parsed.success) {
        // Legacy PortableText row — the R15 backfill re-derives it.
        throw new Error('legacy pre-Lexical body (R15 backfill re-derives)')
      }
      const projections = await computeBodyProjections(parsed.data)
      processed++
      if (
        projections.bodyHtml !== row.bodyHtml ||
        projections.bodyText !== row.bodyText ||
        projections.bodyHtmlFeed !== row.bodyHtmlFeed
      ) {
        await db
          .update(content)
          .set({
            bodyHtml: projections.bodyHtml,
            bodyText: projections.bodyText,
            bodyHtmlFeed: projections.bodyHtmlFeed,
          })
          .where(eq(content.id, row.id))
        rewritten++
      }
    } catch (err) {
      log.error('Reproject content row failed', {
        contentId: String(row.id),
        context: `${row.type}/${row.ownerId}/r${row.revisionNo}`,
        error: err instanceof Error ? err.message : String(err),
      })
      failed++
    }
  }

  const nextOffset = useBatching && offset + rows.length < total ? offset + rows.length : null

  return { processed, failed, rewritten, total, nextOffset }
}
