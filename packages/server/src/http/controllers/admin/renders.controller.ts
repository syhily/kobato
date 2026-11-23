import type { ErrorMessageDescriptor } from '@kobato/api/contracts/primitives'

import { adminRendersContract } from '@kobato/api/rpc/admin/renders'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record'
import { reprojectBodyHtmlBatch } from '@kobato/server/domains/content/services/reproject-body-html'
import { reindexSearchBatch } from '@kobato/server/domains/posts/services/search-reindex'
import { implementAdmin } from '@kobato/server/http/orpc-base'
import { descriptorFor, rawMessageDescriptor } from '@kobato/server/infra/http/error-descriptor'
import { KATEX_OPTIONS } from '@kobato/server/infra/lexical/katex'
import katex from 'katex'

interface RenderMathOutput {
  mathml: string
  error: ErrorMessageDescriptor | null
}

const impl = implementAdmin(adminRendersContract)

const math = impl.math.handler(async ({ input }): Promise<RenderMathOutput> => {
  if (input.tex.trim() === '') {
    return { mathml: '', error: null }
  }
  try {
    const mathml = katex.renderToString(input.tex, { ...KATEX_OPTIONS, displayMode: input.display ?? false })
    return { mathml, error: null }
  } catch (err) {
    return {
      mathml: '',
      error: err instanceof Error ? rawMessageDescriptor(err.message) : descriptorFor('admin.editor.math.renderFailed'),
    }
  }
})

const reindexSearch = impl.reindexSearch.handler(async ({ input, context }) => {
  const result = await reindexSearchBatch(context.db, input)
  recordAuditEventFromContext(context, {
    action: 'search_reindexed',
    resourceType: 'search',
  })
  return result
})

const reprojectBodies = impl.reprojectBodies.handler(async ({ input, context }) => {
  const result = await reprojectBodyHtmlBatch(context.db, input)
  recordAuditEventFromContext(context, {
    action: 'body_projection_rebuilt',
    resourceType: 'cache',
  })
  return result
})

export const adminRendersRouter = impl.router({ math, reindexSearch, reprojectBodies })
