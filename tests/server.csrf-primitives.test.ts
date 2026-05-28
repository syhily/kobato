import { createSession } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BlogSession, BlogSessionData } from '@/server/domains/auth/session-storage'

import { ensureCsrfToken, validateCsrfToken } from '@/server/domains/auth/csrf'

function makeSession(data: Partial<BlogSessionData> = {}): BlogSession {
  return createSession<BlogSessionData, BlogSessionData>(data, 'test-session')
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
