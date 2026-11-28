import { ORPCError } from '@orpc/client'
import { describe, expect, it } from 'vitest'

import {
  clientAuthFlowError,
  isCsrfFailure,
  toClientActionResult,
  type ClientI18nCatalog,
} from '@/lib/client-action-result'

const CATALOG: ClientI18nCatalog = { locale: 'en-US', messages: { 'error.api.csrfFailed': 'Security check failed.' } }

function csrfWireError() {
  return new ORPCError('FORBIDDEN', {
    data: { descriptor: { messageKey: 'error.api.csrfFailed', fallbackMessage: 'CSRF check failed' } },
  })
}

describe('isCsrfFailure', () => {
  it('recognizes the perimeter FORBIDDEN error carrying the csrfFailed descriptor', () => {
    expect(isCsrfFailure(csrfWireError())).toBe(true)
  })

  it('rejects other FORBIDDEN errors, other codes, and non-orpc errors', () => {
    expect(
      isCsrfFailure(
        new ORPCError('FORBIDDEN', {
          data: { descriptor: { messageKey: 'admin.error.forbidden', fallbackMessage: 'no' } },
        }),
      ),
    ).toBe(false)
    expect(isCsrfFailure(new ORPCError('NOT_FOUND', {}))).toBe(false)
    expect(isCsrfFailure(new Response(null, { status: 403 }))).toBe(false)
    expect(isCsrfFailure(null)).toBe(false)
  })
})

describe('client csrf failure mapping', () => {
  it('builds the localized csrf error flow result', () => {
    const result = toClientActionResult(clientAuthFlowError('error.api.csrfFailed'), CATALOG)

    expect(result).toMatchObject({ data: { error: 'Security check failed.' } })
  })

  it('keeps the params in the descriptor for parameterized copy', () => {
    const flow = clientAuthFlowError('auth.setup.error.unknown', { max: 3 })

    expect(flow.descriptor).toMatchObject({ messageKey: 'auth.setup.error.unknown', params: { max: 3 } })
  })
})
