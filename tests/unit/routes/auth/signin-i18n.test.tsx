import { describe, expect, it, vi } from 'vitest'

// Stub WebAuthn so the imported admin forms don't call the real browser entry under SSR.
vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}))

import type { AppLocale } from '@/shared/i18n/locales'

import { renderInRouter } from '#/_helpers/render'
import { asRoute } from '#/_helpers/route-test-utils'
import LoginRouteRaw from '@/routes/auth/signin'

// The sign-in route maps stable query codes to catalog messages per locale —
// `invalid_credentials` never renders a literal. Unknown codes keep the legacy
// raw rendering for external callers.

const LoginRoute = asRoute(LoginRouteRaw)

const baseLoader = {
  redirectTo: '/',
  action: 'login' as const,
  tokenError: null as string | null,
  resetToken: null as string | null,
  magicToken: null as string | null,
  authError: null as string | null,
  csrfToken: 'csrf-test',
}

function renderAuthError(locale: AppLocale, authError: string): string {
  return renderInRouter(<LoginRoute loaderData={{ ...baseLoader, authError }} />, '/signin', { locale })
}

describe('routes/auth/signin — auth error copy per locale', () => {
  it('renders invalid_credentials through the catalog in all four locales', () => {
    expect(renderAuthError('en-US', 'invalid_credentials')).toContain('Incorrect email or password.')
    expect(renderAuthError('zh-CN', 'invalid_credentials')).toContain('用户名或密码不正确。')
    expect(renderAuthError('zh-TW', 'invalid_credentials')).toContain('使用者名稱或密碼不正確。')
    expect(renderAuthError('zh-HK', 'invalid_credentials')).toContain('使用者名稱或密碼不正確。')
  })

  it('never renders the raw code for a known code', () => {
    const html = renderAuthError('en-US', 'invalid_credentials')
    expect(html).not.toContain('invalid_credentials')
  })

  it('keeps the legacy raw rendering for unknown codes', () => {
    expect(renderAuthError('en-US', 'csrf_failed')).toContain('csrf_failed')
  })
})
