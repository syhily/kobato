import { beforeEach, describe, expect, it, vi } from 'vitest'

import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { parseRpcJson } from '#/_helpers/rpc-call'

// Stub every service-layer dep the account controller reaches for. The
// handlers themselves stay real — we exercise their branching (rate-limit,
// passkey-enabled gate, guard propagation, missing-user, invalid-response,
// domain-error propagation) by shaping the mock return values per test.
// The passkey login-method/credential invariant itself lives in passkey/service
// and is covered by tests/unit/server/domains/auth/passkey/service.test.ts;
// the revocation policy lives in session-guard and is covered by
// tests/unit/server/domains/auth/session-guard.test.ts.

const tryRateLimitMock = vi.hoisted(() => vi.fn(async () => ({ exceeded: false })))
const tryPasskeyRegisterBeginRateLimitMock = vi.hoisted(() => vi.fn(async () => ({ exceeded: false })))
const tryPasskeyRegisterFinishRateLimitMock = vi.hoisted(() => vi.fn(async () => ({ exceeded: false })))
const tryPasskeyDeleteRateLimitMock = vi.hoisted(() => vi.fn(async () => ({ exceeded: false })))
const tryPasskeySetForceRateLimitMock = vi.hoisted(() => vi.fn(async () => ({ exceeded: false })))

const isPasskeyEnabledMock = vi.hoisted(() => vi.fn(() => true))
const isMailLoginReadyMock = vi.hoisted(() => vi.fn(() => true))

const updateAccountProfileMock = vi.hoisted(() => vi.fn())
const updateAccountPasswordMock = vi.hoisted(() => vi.fn())
const findSafeUserByIdMock = vi.hoisted(() => vi.fn())
const revokeOwnSessionWithGuardMock = vi.hoisted(() => vi.fn())

const generateRegistrationOptionsMock = vi.hoisted(() => vi.fn())
const verifyRegistrationResponseMock = vi.hoisted(() => vi.fn())
const listCredentialsMock = vi.hoisted(() => vi.fn())
const deleteCredentialMock = vi.hoisted(() => vi.fn())
const setLoginMethodMock = vi.hoisted(() => vi.fn())

const recordAuditEventFromContextMock = vi.hoisted(() => vi.fn())

vi.mock('@/server/infra/rate-limit', () => ({
  tryRateLimit: tryRateLimitMock,
  tryPasskeyRegisterBeginRateLimit: tryPasskeyRegisterBeginRateLimitMock,
  tryPasskeyRegisterFinishRateLimit: tryPasskeyRegisterFinishRateLimitMock,
  tryPasskeyDeleteRateLimit: tryPasskeyDeleteRateLimitMock,
  tryPasskeySetForceRateLimit: tryPasskeySetForceRateLimitMock,
}))

vi.mock('@/server/domains/auth/passkey/gate', () => ({ isPasskeyEnabled: isPasskeyEnabledMock }))

vi.mock('@/server/domains/auth/services/shared', () => ({ isMailLoginReady: isMailLoginReadyMock }))

vi.mock('@/server/domains/users/services/account', () => ({
  updateAccountPassword: updateAccountPasswordMock,
  updateAccountProfile: updateAccountProfileMock,
}))

vi.mock('@/server/infra/db/operations/user', () => ({
  findSafeUserById: findSafeUserByIdMock,
}))

vi.mock('@/server/domains/auth/session-guard', () => ({
  revokeOwnSessionWithGuard: revokeOwnSessionWithGuardMock,
}))

vi.mock('@/server/domains/auth/passkey/service', () => ({
  deleteCredential: deleteCredentialMock,
  generateRegistrationOptions: generateRegistrationOptionsMock,
  listCredentials: listCredentialsMock,
  setLoginMethod: setLoginMethodMock,
  verifyRegistrationResponse: verifyRegistrationResponseMock,
}))

vi.mock('@/server/domains/audit/services/record', () => ({
  recordAuditEventFromContext: recordAuditEventFromContextMock,
}))

const { RPCHandler } = await import('@orpc/server/fetch')
const { DomainError } = await import('@/server/infra/http/errors')
const { accountRouter } = await import('@/server/http/controllers/account.controller')
const handler = new RPCHandler(accountRouter)

async function call(path: string, input: unknown, sessionId = 'session-1') {
  const result = await handler.handle(
    new Request(`http://localhost/rpc${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: input }),
    }),
    { prefix: '/rpc', context: makeAuthedCtx({ role: 'admin', sessionId }) },
  )
  if (!result.matched) {
    throw new Error(`No route matched for ${path}`)
  }
  return result.response
}

function regResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cred-id',
    rawId: 'cred-rawid',
    type: 'public-key',
    response: { clientDataJSON: 'cdj', attestationObject: 'ao' },
    ...overrides,
  }
}

describe('account controller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isPasskeyEnabledMock.mockReturnValue(true)
    isMailLoginReadyMock.mockReturnValue(true)
    tryRateLimitMock.mockResolvedValue({ exceeded: false })
    tryPasskeyRegisterBeginRateLimitMock.mockResolvedValue({ exceeded: false })
    tryPasskeyRegisterFinishRateLimitMock.mockResolvedValue({ exceeded: false })
    tryPasskeyDeleteRateLimitMock.mockResolvedValue({ exceeded: false })
    tryPasskeySetForceRateLimitMock.mockResolvedValue({ exceeded: false })
    findSafeUserByIdMock.mockResolvedValue({
      id: 1n,
      name: 'n',
      email: 'e',
      role: 'admin',
    })
    revokeOwnSessionWithGuardMock.mockResolvedValue({ targetUserId: null })
    listCredentialsMock.mockResolvedValue([])
    deleteCredentialMock.mockResolvedValue(true)
    setLoginMethodMock.mockResolvedValue(undefined)
    generateRegistrationOptionsMock.mockResolvedValue({ options: { challenge: 'c' } })
    verifyRegistrationResponseMock.mockResolvedValue(undefined)
    updateAccountProfileMock.mockResolvedValue({
      id: 1n,
      name: 'n',
      email: 'e',
      link: null,
      badgeName: null,
      badgeColor: null,
      badgeTextColor: null,
      role: 'admin',
      emailVerified: true,
    })
    updateAccountPasswordMock.mockResolvedValue(undefined)
  })

  // ─── updateProfile ───────────────────────────────────────
  describe('updateProfile', () => {
    it('returns the safe user projection on success', async () => {
      const response = await call('/updateProfile', { name: 'Alice', receiveEmail: true })
      expect(response.status).toBe(200)
      const body = await parseRpcJson<{ user: { id: string; role: string } }>(response)
      expect(body.user.id).toBe('1')
      expect(body.user.role).toBe('admin')
      expect(updateAccountProfileMock).toHaveBeenCalledWith(
        expect.anything(),
        1n,
        expect.objectContaining({ name: 'Alice' }),
        'admin',
      )
    })
  })

  // ─── updatePassword ──────────────────────────────────────
  describe('updatePassword', () => {
    it('changes the password and records an audit event when under the rate limit', async () => {
      const response = await call('/updatePassword', {
        oldPassword: 'OldPass1234',
        newPassword: 'NewPassword1',
      })
      expect(response.status).toBe(200)
      const body = await parseRpcJson<{ success: boolean }>(response)
      expect(body.success).toBe(true)
      expect(updateAccountPasswordMock).toHaveBeenCalledWith(
        expect.anything(),
        1n,
        'OldPass1234',
        'NewPassword1',
        'session-1',
      )
      expect(recordAuditEventFromContextMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'password_changed' }),
      )
    })

    it('rejects with TOO_MANY_REQUESTS when the rate limit is exceeded', async () => {
      tryRateLimitMock.mockResolvedValue({ exceeded: true })
      const response = await call('/updatePassword', {
        oldPassword: 'OldPass1234',
        newPassword: 'NewPassword1',
      })
      expect(response.status).toBe(429)
      expect(updateAccountPasswordMock).not.toHaveBeenCalled()
    })

    it('rejects a weak new password with a validation error', async () => {
      const response = await call('/updatePassword', {
        oldPassword: 'x',
        newPassword: 'weak',
      })
      expect(response.status).toBe(400)
    })
  })

  // ─── revokeSession ───────────────────────────────────────
  describe('revokeSession', () => {
    it('returns success without an audit event when the guard reports a no-op (meta missing)', async () => {
      revokeOwnSessionWithGuardMock.mockResolvedValue({ targetUserId: null })
      const response = await call('/revokeSession', { id: 'sess-other' }, 'session-current')
      expect(response.status).toBe(200)
      const body = await parseRpcJson<{ success: boolean; currentSession: boolean }>(response)
      expect(body.success).toBe(true)
      expect(body.currentSession).toBe(false)
      expect(recordAuditEventFromContextMock).not.toHaveBeenCalled()
    })

    it('reports currentSession=true when id matches and records the audit event', async () => {
      revokeOwnSessionWithGuardMock.mockResolvedValue({ targetUserId: 1n })
      const response = await call('/revokeSession', { id: 'session-1' }, 'session-1')
      expect(response.status).toBe(200)
      const body = await parseRpcJson<{ success: boolean; currentSession: boolean }>(response)
      expect(body.currentSession).toBe(true)
      expect(revokeOwnSessionWithGuardMock).toHaveBeenCalledWith(expect.anything(), 'session-1', {
        id: '1',
        name: 'Test User',
        email: 'test@example.com',
        website: null,
        role: 'admin',
      })
      expect(recordAuditEventFromContextMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'session_revoked',
          details: { currentSession: true, targetUserId: '1' },
        }),
      )
    })

    it('propagates the guard FORBIDDEN when the target session belongs to a different user', async () => {
      revokeOwnSessionWithGuardMock.mockRejectedValue(new DomainError('FORBIDDEN', '无权操作该会话。'))
      const response = await call('/revokeSession', { id: 'sess-other' }, 'session-1')
      expect(response.status).toBe(403)
      expect(recordAuditEventFromContextMock).not.toHaveBeenCalled()
    })
  })

  // ─── passkey list ────────────────────────────────────────
  describe('passkeyList', () => {
    it('throws BAD_REQUEST when passkeys are disabled', async () => {
      isPasskeyEnabledMock.mockReturnValue(false)
      const response = await call('/passkeyList', {})
      expect(response.status).toBe(400)
      expect(listCredentialsMock).not.toHaveBeenCalled()
    })

    it('returns the credential projection with ISO timestamps', async () => {
      const ts = new Date('2024-01-01T00:00:00Z')
      listCredentialsMock.mockResolvedValue([
        { id: 'c1', deviceName: 'Phone', createdAt: ts, backedUp: true },
        { id: 'c2', deviceName: null, createdAt: ts, backedUp: false },
      ])
      const response = await call('/passkeyList', {})
      expect(response.status).toBe(200)
      const body = await parseRpcJson<{ credentials: Array<{ id: string; createdAt: string; backedUp: boolean }> }>(
        response,
      )
      expect(body.credentials).toHaveLength(2)
      expect(body.credentials[0]!.createdAt).toBe(ts.toISOString())
      expect(body.credentials[1]!.backedUp).toBe(false)
    })
  })

  // ─── passkey register begin ──────────────────────────────
  describe('passkeyRegisterBegin', () => {
    it('throws BAD_REQUEST when passkeys are disabled', async () => {
      isPasskeyEnabledMock.mockReturnValue(false)
      const response = await call('/passkeyRegisterBegin', {})
      expect(response.status).toBe(400)
    })

    it('throws TOO_MANY_REQUESTS when rate-limited', async () => {
      tryPasskeyRegisterBeginRateLimitMock.mockResolvedValue({ exceeded: true })
      const response = await call('/passkeyRegisterBegin', {})
      expect(response.status).toBe(429)
    })

    it('throws NOT_FOUND when the viewer user cannot be loaded', async () => {
      findSafeUserByIdMock.mockResolvedValue(null)
      const response = await call('/passkeyRegisterBegin', {})
      expect(response.status).toBe(404)
    })

    it('forwards the SafeUser from the accessor verbatim to generateRegistrationOptions', async () => {
      const safeUser = { id: 1n, name: 'n', email: 'e', role: 'admin' }
      findSafeUserByIdMock.mockResolvedValue(safeUser)
      const response = await call('/passkeyRegisterBegin', { deviceName: 'YubiKey' })
      expect(response.status).toBe(200)
      const body = await parseRpcJson<{ options: unknown }>(response)
      expect(body.options).toEqual({ challenge: 'c' })
      expect(findSafeUserByIdMock).toHaveBeenCalledWith(expect.anything(), 1n)
      expect(generateRegistrationOptionsMock).toHaveBeenCalledWith(expect.anything(), safeUser, 'YubiKey')
    })
  })

  // ─── passkey register finish ─────────────────────────────
  describe('passkeyRegisterFinish', () => {
    const validFinish = {
      response: regResponse(),
      deviceName: 'Phone',
      challenge: 'stored-challenge',
    }

    it('throws BAD_REQUEST when passkeys are disabled', async () => {
      isPasskeyEnabledMock.mockReturnValue(false)
      const response = await call('/passkeyRegisterFinish', validFinish)
      expect(response.status).toBe(400)
    })

    it('throws TOO_MANY_REQUESTS when rate-limited', async () => {
      tryPasskeyRegisterFinishRateLimitMock.mockResolvedValue({ exceeded: true })
      const response = await call('/passkeyRegisterFinish', validFinish)
      expect(response.status).toBe(429)
    })

    it('throws NOT_FOUND when the viewer user is missing', async () => {
      findSafeUserByIdMock.mockResolvedValue(null)
      const response = await call('/passkeyRegisterFinish', validFinish)
      expect(response.status).toBe(404)
    })

    it('throws BAD_REQUEST when the response shape is invalid', async () => {
      const response = await call('/passkeyRegisterFinish', {
        response: { not: 'a registration' },
        challenge: 'c',
      })
      expect(response.status).toBe(400)
      expect(verifyRegistrationResponseMock).not.toHaveBeenCalled()
    })

    it('records an audit event on successful verification', async () => {
      const response = await call('/passkeyRegisterFinish', validFinish)
      expect(response.status).toBe(200)
      expect(verifyRegistrationResponseMock).toHaveBeenCalled()
      expect(recordAuditEventFromContextMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'passkey_registered' }),
      )
    })
  })

  // ─── passkey delete ──────────────────────────────────────
  describe('passkeyDelete', () => {
    it('throws NOT_FOUND when the credential does not exist', async () => {
      deleteCredentialMock.mockResolvedValue(false)
      const response = await call('/passkeyDelete', { credentialId: 'nope' })
      expect(response.status).toBe(404)
      expect(recordAuditEventFromContextMock).not.toHaveBeenCalled()
    })

    it('deletes the credential and records an audit event', async () => {
      const response = await call('/passkeyDelete', { credentialId: 'c1' })
      expect(response.status).toBe(200)
      expect(deleteCredentialMock).toHaveBeenCalledWith(expect.anything(), 'c1', 1n)
      expect(recordAuditEventFromContextMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'passkey_deleted' }),
      )
    })

    it('throws BAD_REQUEST when passkeys are disabled', async () => {
      isPasskeyEnabledMock.mockReturnValue(false)
      const response = await call('/passkeyDelete', { credentialId: 'c1' })
      expect(response.status).toBe(400)
    })
  })

  // ─── set login method ────────────────────────────────────
  describe('setLoginMethod', () => {
    it('propagates the domain rejection when choosing passkey with no credentials', async () => {
      setLoginMethodMock.mockRejectedValue(
        new DomainError('BAD_REQUEST', '必须至少注册一个 Passkey 才能选择 Passkey 登陆。'),
      )
      const response = await call('/setLoginMethod', { method: 'passkey' })
      expect(response.status).toBe(400)
      expect(recordAuditEventFromContextMock).not.toHaveBeenCalled()
    })

    it('switches to passkey and records an audit event', async () => {
      const response = await call('/setLoginMethod', { method: 'passkey' })
      expect(response.status).toBe(200)
      expect(setLoginMethodMock).toHaveBeenCalledWith(expect.anything(), 1n, 'passkey')
      expect(recordAuditEventFromContextMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'login_method_changed', details: { method: 'passkey' } }),
      )
    })

    it('switches back to password', async () => {
      const response = await call('/setLoginMethod', { method: 'password' })
      expect(response.status).toBe(200)
      expect(setLoginMethodMock).toHaveBeenCalledWith(expect.anything(), 1n, 'password')
    })

    it('throws BAD_REQUEST when choosing passkey while passkeys are disabled', async () => {
      isPasskeyEnabledMock.mockReturnValue(false)
      const response = await call('/setLoginMethod', { method: 'passkey' })
      expect(response.status).toBe(400)
      expect(setLoginMethodMock).not.toHaveBeenCalled()
    })

    it('throws BAD_REQUEST when choosing magic-link while mail is not configured', async () => {
      isMailLoginReadyMock.mockReturnValue(false)
      const response = await call('/setLoginMethod', { method: 'magic-link' })
      expect(response.status).toBe(400)
      expect(setLoginMethodMock).not.toHaveBeenCalled()
    })

    it('switches to magic-link when mail is ready', async () => {
      const response = await call('/setLoginMethod', { method: 'magic-link' })
      expect(response.status).toBe(200)
      expect(setLoginMethodMock).toHaveBeenCalledWith(expect.anything(), 1n, 'magic-link')
      expect(recordAuditEventFromContextMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'login_method_changed', details: { method: 'magic-link' } }),
      )
    })

    it('throws TOO_MANY_REQUESTS when rate-limited', async () => {
      tryPasskeySetForceRateLimitMock.mockResolvedValue({ exceeded: true })
      const response = await call('/setLoginMethod', { method: 'password' })
      expect(response.status).toBe(429)
    })
  })
})
