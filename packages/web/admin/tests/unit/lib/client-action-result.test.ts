import type { AuthFlowOutput } from '@kobato/api/contracts/account/auth'
import type { AppLocale } from '@kobato/i18n/locales'

import { serverMessagesFor, uiMessagesFor } from '@kobato/i18n/catalog'
import { authFlowMessage } from '@kobato/server/domains/auth/services/shared'
import { toClientActionResult } from '@kobato/web-admin/lib/client-action-result'
import { describe, expect, it } from 'vitest'

const locale: AppLocale = 'zh-CN'
const catalog = { locale, messages: uiMessagesFor(locale) }

const tooShort: AuthFlowOutput = {
  type: 'error',
  message: 'ignored',
  descriptor: {
    messageKey: 'auth.passwordReset.error.passwordTooShort',
    params: { min: 8 },
    fallbackMessage: 'The password must be at least 8 characters.',
  },
}

const tooLong: AuthFlowOutput = {
  type: 'error',
  message: 'ignored',
  descriptor: {
    messageKey: 'auth.passwordReset.error.passwordTooLong',
    params: { max: 72 },
    fallbackMessage: 'The password is too long (at most 72 bytes).',
  },
}

const invalidToken: AuthFlowOutput = {
  type: 'error',
  message: 'The link is invalid or has expired.',
  descriptor: {
    messageKey: 'auth.signin.error.invalidToken',
    fallbackMessage: 'The link is invalid or has expired.',
  },
}

const plainSuccess: AuthFlowOutput = { type: 'success', message: 'Signed in.' }

function payload(result: ReturnType<typeof toClientActionResult>): Record<string, unknown> {
  const unwrapped = (result as { data: Record<string, unknown> }).data
  expect(unwrapped).toBeDefined()
  return unwrapped
}

describe('toClientActionResult', () => {
  it('maps a redirect outcome without response headers', () => {
    const result = toClientActionResult({ type: 'redirect', to: '/admin' }, catalog)
    expect(result).toBeInstanceOf(Response)
    const response = result as Response
    expect(response.headers.get('Location')).toBe('/admin')
    expect(response.headers.get('Set-Cookie')).toBeNull()
  })

  it('maps an error outcome and keeps the descriptor in the payload', () => {
    const data = payload(toClientActionResult(tooShort, catalog))
    expect(data.error).toBe(authFlowMessage(tooShort.message, tooShort.descriptor, locale))
    expect(data.errorDescriptor).toEqual(tooShort.descriptor)
    expect(data).not.toHaveProperty('message')
  })

  it('formats descriptor copy identically to authFlowMessage for the same input', () => {
    const enCatalog = {
      locale: 'en-US' as AppLocale,
      messages: { ...uiMessagesFor('en-US'), ...serverMessagesFor('en-US') },
    }
    expect(payload(toClientActionResult(tooShort, enCatalog)).error).toBe(
      authFlowMessage(tooShort.message, tooShort.descriptor, 'en-US'),
    )
    expect(payload(toClientActionResult(tooLong, catalog)).error).toBe(
      authFlowMessage(tooLong.message, tooLong.descriptor, locale),
    )
  })

  it('falls back to the raw id when the catalog misses the key', () => {
    const emptyCatalog = { locale, messages: {} }
    const data = payload(toClientActionResult(invalidToken, emptyCatalog))
    expect(data.error).toBe('auth.signin.error.invalidToken')
    expect(data.error).not.toBe(authFlowMessage(invalidToken.message, invalidToken.descriptor, locale))
  })

  it('keeps the raw message when no descriptor is present', () => {
    const plainError: AuthFlowOutput = { type: 'error', message: 'The link is invalid or has expired.' }
    const errorData = payload(toClientActionResult(plainError, catalog))
    expect(errorData.error).toBe('The link is invalid or has expired.')
    expect(errorData).not.toHaveProperty('errorDescriptor')

    const successData = payload(toClientActionResult(plainSuccess, catalog))
    expect(successData.message).toBe('Signed in.')
    expect(successData).not.toHaveProperty('messageDescriptor')
  })

  it('merges extra data into the payload', () => {
    const data = payload(toClientActionResult(plainSuccess, catalog, { flow: 'signin' }))
    expect(data).toMatchObject({ message: 'Signed in.', flow: 'signin' })
  })
})
