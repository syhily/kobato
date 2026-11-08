import katex from 'katex'
import { z } from 'zod'

import type { ErrorMessageDescriptor } from '@/shared/contracts/api-error'
import type { RenderMathOutput } from '@/shared/types/pages'

import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { reprojectBodyHtmlBatch } from '@/server/domains/content/services/reproject-body-html'
import { reindexSearchBatch } from '@/server/domains/posts/services/search-reindex'
import { adminProc } from '@/server/http/orpc-base'
import { descriptorFor, rawMessageDescriptor } from '@/server/infra/http/error-descriptor'
import { KATEX_OPTIONS } from '@/server/infra/pt/katex'

const MAX_RENDER_INPUT_LENGTH = 10_000

const math = adminProc
  .route({ method: 'POST', path: '/admin/renders/math' })
  .input(z.object({ tex: z.string().max(MAX_RENDER_INPUT_LENGTH), display: z.boolean().optional() }))
  .output(z.object({ mathml: z.string(), error: z.custom<ErrorMessageDescriptor>().nullable() }))
  .handler(async ({ input }): Promise<RenderMathOutput> => {
    if (input.tex.trim() === '') {
      return { mathml: '', error: null }
    }
    try {
      const mathml = katex.renderToString(input.tex, { ...KATEX_OPTIONS, displayMode: input.display ?? false })
      return { mathml, error: null }
    } catch (err) {
      // KaTeX's own message is technical text: wrap it in the raw passthrough
      // descriptor so the client can still localize the envelope. A non-Error
      // throw uses the typed fallback instead of a hardcoded sentence.
      return {
        mathml: '',
        error:
          err instanceof Error ? rawMessageDescriptor(err.message) : descriptorFor('admin.editor.math.renderFailed'),
      }
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

const reprojectBodies = adminProc
  .route({ method: 'POST', path: '/admin/renders/reproject-bodies' })
  .input(z.object({ offset: z.number().optional(), batchSize: z.number().optional() }))
  .output(
    z.object({
      processed: z.number(),
      failed: z.number(),
      rewritten: z.number(),
      total: z.number(),
      nextOffset: z.number().nullable(),
    }),
  )
  .handler(async ({ input, context }) => {
    const result = await reprojectBodyHtmlBatch(context.db, input)
    recordAuditEventFromContext(context, {
      action: 'body_projection_rebuilt',
      resourceType: 'cache',
    })
    return result
  })

export const adminRendersRouter = { math, reindexSearch, reprojectBodies }
