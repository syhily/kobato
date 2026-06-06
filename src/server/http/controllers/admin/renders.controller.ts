import { z } from 'zod'

import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { reindexSearchBatch } from '@/server/domains/posts/services/search-reindex'
import { adminProc } from '@/server/http/orpc-base'
import { getKatexRenderer, type KatexRenderer } from '@/server/infra/pt/katex-renderer'

const MAX_RENDER_INPUT_LENGTH = 10_000

const math = adminProc
  .route({ method: 'POST', path: '/admin/renders/math' })
  .input(z.object({ tex: z.string().max(MAX_RENDER_INPUT_LENGTH), display: z.boolean().optional() }))
  .output(z.object({ mathml: z.string(), error: z.string().nullable() }))
  .handler(async ({ input }) => {
    if (input.tex.trim() === '') {
      return { mathml: '', error: null }
    }
    let renderer: KatexRenderer
    try {
      renderer = await getKatexRenderer()
    } catch (err) {
      return { mathml: '', error: err instanceof Error ? err.message : 'KaTeX 加载失败' }
    }
    try {
      const mathml = await renderer.render(input.tex, input.display ?? false)
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
