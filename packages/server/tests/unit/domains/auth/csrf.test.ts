import type { BlogSession, BlogSessionData } from '@kobato/server/domains/auth/session-storage'

import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'

import {
  buildCsrfCookieHeader,
  deriveStatelessCsrfToken,
  ensureCsrfToken,
  isCsrfCookieValue,
  isPathExempt,
  mintCsrfCookieValue,
  validateCsrfForAction,
  validateCsrfToken,
  CSRF_HEADER,
} from '@kobato/server/domains/auth/csrf'
import { createSession } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

function makeSession(data: Partial<BlogSessionData> = {}): BlogSession {
  return createSession<BlogSessionData, BlogSessionData>(data, 'test-session')
}

function seedCsrfSettings(csrf: { enabled: boolean; exemptPaths: string[] }): void {
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    security: {
      ...TEST_BLOG_SETTINGS_BUNDLE.security!,
      csrf,
    },
  })
}

describe('ensureCsrfToken', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('generates a token on first call', () => {
    const session = makeSession()
    const token = ensureCsrfToken(session)
    expect(token).toBeTruthy()
    expect(typeof token).toBe('string')
    expect(session.get('csrfToken')).toBe(token)
  })

  it('reuses existing token on subsequent calls', () => {
    const session = makeSession({ csrfToken: 'existing-token' })
    const token = ensureCsrfToken(session)
    expect(token).toBe('existing-token')
  })

  it('generates a 64-character hex token (32 bytes of entropy)', () => {
    const session = makeSession()
    const token = ensureCsrfToken(session)
    expect(token).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('validateCsrfToken', () => {
  it('accepts matching header value', () => {
    const session = makeSession({ csrfToken: 'test-token' })
    expect(validateCsrfToken(session, 'test-token')).toBe(true)
  })

  it('rejects mismatched header value', () => {
    const session = makeSession({ csrfToken: 'test-token' })
    expect(validateCsrfToken(session, 'wrong-token')).toBe(false)
  })

  it('rejects null header', () => {
    const session = makeSession({ csrfToken: 'test-token' })
    expect(validateCsrfToken(session, null)).toBe(false)
  })

  it('rejects undefined header', () => {
    const session = makeSession({ csrfToken: 'test-token' })
    expect(validateCsrfToken(session, undefined)).toBe(false)
  })

  it('rejects when session has no token', () => {
    const session = makeSession()
    expect(validateCsrfToken(session, 'any-value')).toBe(false)
  })

  it('rejects different-length strings (constant-time guard)', () => {
    const session = makeSession({ csrfToken: 'short' })
    expect(validateCsrfToken(session, 'a-much-longer-value')).toBe(false)
  })
})

describe('isPathExempt (P1-6 segment boundary)', () => {
  it('exempts the exact path and its subpaths', () => {
    seedCsrfSettings({ enabled: true, exemptPaths: ['/api/admin'] })
    expect(isPathExempt('/api/admin')).toBe(true)
    expect(isPathExempt('/api/admin/users')).toBe(true)
  })

  it('does not exempt a look-alike path that merely shares the prefix', () => {
    seedCsrfSettings({ enabled: true, exemptPaths: ['/api/admin'] })
    expect(isPathExempt('/api/adminx')).toBe(false)
    expect(isPathExempt('/api/administrators')).toBe(false)
  })

  it('does not exempt non-slash continuations such as file extensions', () => {
    seedCsrfSettings({ enabled: true, exemptPaths: ['/feed'] })
    expect(isPathExempt('/feed.xml')).toBe(false)
  })
})

describe('validateCsrfForAction (security.csrf.enabled switch)', () => {
  it('validates the header token while protection is enabled', () => {
    seedCsrfSettings({ enabled: true, exemptPaths: [] })
    const session = makeSession({ csrfToken: 'test-token' })
    const ok = new Request('https://example.com/signin', { method: 'POST', headers: { [CSRF_HEADER]: 'test-token' } })
    const bad = new Request('https://example.com/signin', { method: 'POST', headers: { [CSRF_HEADER]: 'wrong' } })
    expect(validateCsrfForAction(session, ok, new FormData())).toBe(true)
    expect(validateCsrfForAction(session, bad, new FormData())).toBe(false)
  })

  it('skips validation when protection is disabled', () => {
    seedCsrfSettings({ enabled: false, exemptPaths: [] })
    // No token in the session and no header — would fail if validated.
    const session = makeSession()
    const request = new Request('https://example.com/signin', { method: 'POST' })
    expect(validateCsrfForAction(session, request, new FormData())).toBe(true)
  })
})

describe('stateless anonymous tokens (P1-4)', () => {
  it('mints a 64-char hex cookie value accepted by isCsrfCookieValue', () => {
    const value = mintCsrfCookieValue()
    expect(value).toMatch(/^[0-9a-f]{64}$/)
    expect(isCsrfCookieValue(value)).toBe(true)
  })

  it('isCsrfCookieValue rejects malformed values', () => {
    expect(isCsrfCookieValue('short')).toBe(false)
    expect(isCsrfCookieValue('')).toBe(false)
    expect(isCsrfCookieValue('z'.repeat(64))).toBe(false)
  })

  it('deriveStatelessCsrfToken is deterministic and bound to the cookie value', () => {
    const a = mintCsrfCookieValue()
    const b = mintCsrfCookieValue()
    expect(deriveStatelessCsrfToken(a)).toBe(deriveStatelessCsrfToken(a))
    expect(deriveStatelessCsrfToken(a)).toMatch(/^[0-9a-f]{64}$/)
    expect(deriveStatelessCsrfToken(a)).not.toBe(deriveStatelessCsrfToken(b))
    // The cookie value itself never leaks into the token.
    expect(deriveStatelessCsrfToken(a)).not.toContain(a)
  })

  it('buildCsrfCookieHeader serializes an HttpOnly SameSite=Lax cookie', () => {
    const header = buildCsrfCookieHeader('abc')
    expect(header).toContain('__csrf=abc')
    expect(header).toContain('Path=/')
    expect(header).toContain('HttpOnly')
    expect(header).toContain('SameSite=Lax')
  })
})
