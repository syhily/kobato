import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SigninFlowContext } from '@/server/domains/auth/services/shared'
import type { BlogSession } from '@/server/domains/auth/session-storage'

// Flow-seam tests for `domains/auth/passkey/signin`. The WebAuthn ceremony
// itself lives in `passkey/service` (covered by `service.test.ts`); here
// we pin the sign-in leg's guard order, rate limit, session establish,
// last-login touch, audit emission, and error passthrough.

const mocks = vi.hoisted(() => ({
  isPasskeyEnabled: vi.fn(() => true),
  verifyAuthenticationResponse: vi.fn(),
  establishLoginSession: vi.fn(async () => ({ sid: 'sid-1', setCookie: '__session=abc' })),
  updateLastLogin: vi.fn(async () => undefined),
  tryPasskeyAuthFinishRateLimit: vi.fn(async () => ({ count: 1, exceeded: false })),
  recordAuditEvent: vi.fn(),
}))

vi.mock('@/server/domains/auth/passkey/gate', () => ({
  isPasskeyEnabled: mocks.isPasskeyEnabled,
}))

vi.mock('@/server/domains/auth/passkey/service', () => ({
  verifyAuthenticationResponse: mocks.verifyAuthenticationResponse,
}))

vi.mock('@/server/domains/auth/primitives', () => ({
  establishLoginSession: mocks.establishLoginSession,
}))

vi.mock('@/server/infra/db/operations/user', () => ({
  updateLastLogin: mocks.updateLastLogin,
}))

vi.mock('@/server/infra/rate-limit', () => ({
  tryPasskeyAuthFinishRateLimit: mocks.tryPasskeyAuthFinishRateLimit,
}))

vi.mock('@/server/domains/audit/services/record', () => ({
  recordAuditEvent: mocks.recordAuditEvent,
}))

import { signInWithPasskey } from '@/server/domains/auth/passkey/signin'

const db = {} as NodePgDatabase
const session = { id: 'sess-1' } as unknown as BlogSession
const CLIENT = '203.0.113.7'

// The passkey leg never mutates the same session — markSessionDirty is a
// no-op stand-in; only the sid-rotating setCookie channel is exercised.
function ctx(): SigninFlowContext {
  return { db, session, clientAddress: CLIENT, markSessionDirty: () => {} }
}

function request(): Request {
  return new Request('http://localhost/admin/signin?action=passkey', {
    method: 'POST',
    headers: { 'User-Agent': 'vitest' },
  })
}

function passkeyForm(): FormData {
  const fd = new FormData()
  fd.set('passkey_response', JSON.stringify({ id: 'cred-1' }))
  fd.set('passkey_challenge', 'challenge-1')
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isPasskeyEnabled.mockReturnValue(true)
})

describe('auth/passkey/signin — signInWithPasskey', () => {
  it('refuses when the passkey feature is disabled', async () => {
    mocks.isPasskeyEnabled.mockReturnValueOnce(false)

    const result = await signInWithPasskey(ctx(), request(), passkeyForm(), '/admin')

    expect(result).toEqual({ type: 'error', message: 'Passkey 登录未启用。' })
    expect(mocks.verifyAuthenticationResponse).not.toHaveBeenCalled()
  })

  it('refuses when the response or challenge field is missing', async () => {
    const result = await signInWithPasskey(ctx(), request(), new FormData(), '/admin')

    expect(result).toEqual({ type: 'error', message: 'Passkey 响应缺失。' })
    expect(mocks.tryPasskeyAuthFinishRateLimit).not.toHaveBeenCalled()
  })

  it('refuses a malformed JSON response', async () => {
    const fd = new FormData()
    fd.set('passkey_response', '{not-json')
    fd.set('passkey_challenge', 'challenge-1')

    const result = await signInWithPasskey(ctx(), request(), fd, '/admin')

    expect(result).toEqual({ type: 'error', message: 'Passkey 响应格式错误。' })
    expect(mocks.verifyAuthenticationResponse).not.toHaveBeenCalled()
  })

  it('refuses when the finish rate limit trips', async () => {
    mocks.tryPasskeyAuthFinishRateLimit.mockResolvedValueOnce({ count: 9, exceeded: true })

    const result = await signInWithPasskey(ctx(), request(), passkeyForm(), '/admin')

    expect(result).toEqual({ type: 'error', message: '操作过于频繁，请稍后再试。' })
    expect(mocks.verifyAuthenticationResponse).not.toHaveBeenCalled()
  })

  it('on success: establishes a passkey session, touches last-login, audits, redirects', async () => {
    mocks.verifyAuthenticationResponse.mockResolvedValueOnce({
      user: { id: 9n, name: 'Admin', email: 'admin@example.com', role: 'admin' },
      authMethod: 'passkey',
    })

    const req = request()
    const result = await signInWithPasskey(ctx(), req, passkeyForm(), '/admin')

    expect(result).toEqual({ type: 'redirect', to: '/admin', setCookie: '__session=abc' })
    expect(mocks.verifyAuthenticationResponse).toHaveBeenCalledWith(db, { id: 'cred-1' }, 'challenge-1')
    expect(mocks.establishLoginSession).toHaveBeenCalledWith(
      db,
      session,
      expect.objectContaining({ id: 9n }),
      req,
      CLIENT,
      { authMethod: 'passkey' },
    )
    // establishLoginSession owns the entire login side-effect surface —
    // the flow itself must NOT write last_login or a second login audit.
    expect(mocks.updateLastLogin).not.toHaveBeenCalled()
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled()
  })

  it('surfaces the service error message verbatim', async () => {
    mocks.verifyAuthenticationResponse.mockRejectedValueOnce(new Error('登录挑战已过期或无效，请重试。'))

    const result = await signInWithPasskey(ctx(), request(), passkeyForm(), '/admin')

    expect(result).toEqual({ type: 'error', message: '登录挑战已过期或无效，请重试。' })
    expect(mocks.establishLoginSession).not.toHaveBeenCalled()
  })

  it('falls back to the generic error for non-Error throws', async () => {
    mocks.verifyAuthenticationResponse.mockRejectedValueOnce('boom')

    const result = await signInWithPasskey(ctx(), request(), passkeyForm(), '/admin')

    expect(result).toEqual({ type: 'error', message: 'Passkey 验证失败，请重试。' })
  })
})
