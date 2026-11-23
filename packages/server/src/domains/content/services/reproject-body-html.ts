import type { Database } from '@kobato/db/sqlite/database'

import {
  countContentRows,
  listContentProjectionRows,
  updateContentProjections,
} from '@kobato/db/sqlite/operations/content/entity-asset'
import { lexicalEditorStateSchema } from '@kobato/inkling/headless/schema'
import { computeBodyProjections } from '@kobato/server/infra/lexical/lexical-projection'
import { getLogger } from '@kobato/server/infra/logger'

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

  const rows = await listContentProjectionRows(db, offset, batchSize)
  const total = await countContentRows(db)

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
        await updateContentProjections(db, row.id, projections)
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
