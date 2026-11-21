import type { Database } from '@kobato/db/database'

import { content } from '@kobato/db/schema/content'
import { lexicalEditorStateSchema } from '@kobato/inkling/headless/schema'
import { computeBodyProjections } from '@kobato/server/infra/lexical/lexical-projection'
import { getLogger } from '@kobato/server/infra/logger'
import { count, eq } from 'drizzle-orm'

const log = getLogger('content.reproject-body-html')

export interface ReprojectBodyHtmlBatchInput {
  offset?: number
  batchSize?: number
}

export interface ReprojectBodyHtmlBatchResult {
  processed: number
  failed: number
  rewritten: number
  total: number
  nextOffset: number | null
}

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
        throw new Error('body is not a Lexical state')
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
