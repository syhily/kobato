import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record'
import { reindexSearchBatch } from '@kobato/server/domains/posts/services/search-reindex'
import { adminProc } from '@kobato/server/http/orpc-base'
import { KATEX_OPTIONS } from '@kobato/server/infra/markup/katex'
import katex from 'katex'
import { z } from 'zod'

const MAX_RENDER_INPUT_LENGTH = 10_000

const math = adminProc
  .route({ method: 'POST', path: '/admin/renders/math' })
  .input(z.object({ tex: z.string().max(MAX_RENDER_INPUT_LENGTH), display: z.boolean().optional() }))
  .output(z.object({ mathml: z.string(), error: z.string().nullable() }))
  .handler(async ({ input }) => {
    if (input.tex.trim() === '') {
      return { mathml: '', error: null }
    }
    try {
      const mathml = katex.renderToString(input.tex, { ...KATEX_OPTIONS, displayMode: input.display ?? false })
      return { mathml, error: null }
    } catch (err) {
      return { mathml: '', error: err instanceof Error ? err.message : '公式渲染失败' }
    }
  })

const reindexSearch = adminProc
  .route({ method: 'POST', path: '/admin/renders/reindex-search' })
  .input(z.object({ offset: z.number().optional(), batchSize: z.number().optional() }))
  .output(
    z.object({
      processed: z.number(),
      failed: z.number(),
      total: z.number(),
      nextOffset: z.number().nullable(),
    }),
  )
  .handler(async ({ input, context }) => {
    const result = await reindexSearchBatch(context.db, input)
    recordAuditEventFromContext(context, {
      action: 'search_reindexed',
      resourceType: 'search',
    })
    return result
  })

export const adminRendersRouter = { math, reindexSearch }
