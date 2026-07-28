import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import bcrypt from 'bcryptjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SigninFlowContext } from '@/server/domains/auth/services/shared'
import type { BlogSession } from '@/server/domains/auth/session-storage'

// Flow-seam tests for `domains/auth/password-flow`. Everything below the
// flow (repos, tokens, mail, rate limit, passkey cleanup, session
// primitive, audit) is mocked so each pin asserts the flow's own
// orchestration: rate-limit strategy, enumeration-safe generic success,
// the commenter-claim business rule, and the reset invariant
// (revokeOtherSessions + passkey cleanup ordering). The comments domain's
// "established commenter" check arrives as an injected dependency
// (`PasswordResetFlowDeps`), so it is stubbed directly — no module mock.

const mocks = vi.hoisted(() => ({
  issueResetToken: vi.fn(async () => ({ token: 'tok-abc', expiresAt: new Date() })),
  consumeToken: vi.fn(),
  findUserByEmail: vi.fn(async () => null),
  findUserById: vi.fn(async () => null),
  updateUserById: vi.fn<(db: unknown, id: unknown, patch: unknown) => Promise<null>>(async () => null),
  sendPasswordReset: vi.fn<(user: unknown, link: string) => Promise<{ ok: boolean }>>(async () => ({ ok: true })),
  recordAuditEvent: vi.fn(),
  hasApprovedComments: vi.fn(async () => false),
  tryPasswordResetRateLimit: vi.fn(async () => ({ count: 1, exceeded: false })),
  tryPasswordResetByEmailRateLimit: vi.fn(async () => ({ count: 1, exceeded: false })),
  deleteAllCredentials: vi.fn(async () => 0),
  establishLoginSession: vi.fn(async () => ({ sid: 'sid-1', setCookie: '__session=abc' })),
  getBlogSettingsBundleSync: vi.fn<() => { siteIdentity: { website: string } } | undefined>(() => ({
    siteIdentity: { website: 'https://blog.example.com' },
  })),
}))

vi.mock('@/server/domains/auth/verification-tokens', () => ({
  issueResetToken: mocks.issueResetToken,
  consumeToken: mocks.consumeToken,
}))

vi.mock('@/server/infra/db/operations/user', () => ({
  findUserByEmail: mocks.findUserByEmail,
  findUserById: mocks.findUserById,
  updateUserById: mocks.updateUserById,
  PASSWORD_HASH_ROUNDS: 4,
}))

vi.mock('@/server/infra/email/sender', () => ({
  sendPasswordReset: mocks.sendPasswordReset,
}))

vi.mock('@/server/domains/audit/services/record', () => ({
  recordAuditEvent: mocks.recordAuditEvent,
}))

vi.mock('@/server/infra/rate-limit', () => ({
  tryPasswordResetRateLimit: mocks.tryPasswordResetRateLimit,
  tryPasswordResetByEmailRateLimit: mocks.tryPasswordResetByEmailRateLimit,
}))

vi.mock('@/server/domains/auth/passkey/service', () => ({
  deleteAllCredentials: mocks.deleteAllCredentials,
}))

vi.mock('@/server/domains/auth/primitives', () => ({
  establishLoginSession: mocks.establishLoginSession,
}))

vi.mock('@/shared/config/getters', () => ({
  getBlogSettingsBundleSync: mocks.getBlogSettingsBundleSync,
}))

import { requestPasswordReset, resetPasswordWithToken } from '@/server/domains/auth/services/password-reset'

const db = {} as NodePgDatabase
const session = { id: 'sess-1' } as unknown as BlogSession
const CLIENT = '203.0.113.7'
const GENERIC = '如果该邮箱存在且符合要求，重置邮件已发送。'
const resetDeps = { hasApprovedComments: mocks.hasApprovedComments }

function flowCtx(): SigninFlowContext {
  return { db, session, clientAddress: CLIENT, markSessionDirty: vi.fn() }
}

function request(): Request {
  return new Request('http://localhost/admin/signin?action=lostpassword', {
    method: 'POST',
    headers: { 'User-Agent': 'vitest' },
  })
}

function formWith(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    fd.set(key, value)
  }
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('auth/password-flow — requestPasswordReset', () => {
  it('short-circuits with the generic success when the per-IP limit trips (no lookup)', async () => {
    mocks.tryPasswordResetRateLimit.mockResolvedValueOnce({ count: 9, exceeded: true })

    const result = await requestPasswordReset(db, CLIENT, request(), formWith({ email: 'a@example.com' }), resetDeps)

    expect(result).toEqual({ type: 'success', message: GENERIC })
    expect(mocks.findUserByEmail).not.toHaveBeenCalled()
    expect(mocks.sendPasswordReset).not.toHaveBeenCalled()
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled()
  })

  it('short-circuits with the generic success when the per-email limit trips', async () => {
    mocks.tryPasswordResetByEmailRateLimit.mockResolvedValueOnce({ count: 9, exceeded: true })

    const result = await requestPasswordReset(db, CLIENT, request(), formWith({ email: 'a@example.com' }), resetDeps)

    expect(result).toEqual({ type: 'success', message: GENERIC })
    expect(mocks.tryPasswordResetByEmailRateLimit).toHaveBeenCalledWith('a@example.com')
    expect(mocks.findUserByEmail).not.toHaveBeenCalled()
  })

  it('skips the per-email bucket when the form has no email', async () => {
    const result = await requestPasswordReset(db, CLIENT, request(), formWith({}), resetDeps)

    expect(result).toEqual({ type: 'success', message: GENERIC })
    expect(mocks.tryPasswordResetByEmailRateLimit).not.toHaveBeenCalled()
    expect(mocks.findUserByEmail).not.toHaveBeenCalled()
  })

  it('issues one token, sends one email, and audits once for an existing user', async () => {
    mocks.findUserByEmail.mockResolvedValueOnce({
      id: 7n,
      name: 'Vis',
      email: 'vis@example.com',
      role: 'visitor',
      password: 'hashed',
      deletedAt: null,
    } as never)

    const result = await requestPasswordReset(db, CLIENT, request(), formWith({ email: 'vis@example.com' }), resetDeps)

    expect(result).toEqual({ type: 'success', message: GENERIC })
    expect(mocks.issueResetToken).toHaveBeenCalledTimes(1)
    expect(mocks.issueResetToken).toHaveBeenCalledWith(db, 7n)
    expect(mocks.sendPasswordReset).toHaveBeenCalledTimes(1)
    const [sentUser, link] = mocks.sendPasswordReset.mock.calls[0]!
    expect(sentUser).toMatchObject({ email: 'vis@example.com' })
    expect(link).toBe('https://blog.example.com/admin/signin?action=resetpassword&token=tok-abc')
    expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1)
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'password_reset_requested',
        resourceType: 'user',
        resourceId: '7',
        actorId: 7n,
        actorRole: 'visitor',
        ipAddress: CLIENT,
        userAgent: 'vitest',
      }),
    )
  })

  it('falls back to the request origin when no site website is configured', async () => {
    mocks.getBlogSettingsBundleSync.mockReturnValueOnce(undefined)
    mocks.findUserByEmail.mockResolvedValueOnce({
      id: 7n,
      name: 'Vis',
      email: 'vis@example.com',
      role: 'visitor',
      password: 'hashed',
      deletedAt: null,
    } as never)

    await requestPasswordReset(db, CLIENT, request(), formWith({ email: 'vis@example.com' }), resetDeps)

    const [, link] = mocks.sendPasswordReset.mock.calls[0]!
    expect(link).toBe('http://localhost/admin/signin?action=resetpassword&token=tok-abc')
  })

  it('stays silent for an unknown email (enumeration-safe)', async () => {
    const result = await requestPasswordReset(
      db,
      CLIENT,
      request(),
      formWith({ email: 'ghost@example.com' }),
      resetDeps,
    )

    expect(result).toEqual({ type: 'success', message: GENERIC })
    expect(mocks.issueResetToken).not.toHaveBeenCalled()
    expect(mocks.sendPasswordReset).not.toHaveBeenCalled()
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled()
  })

  it('stays silent for a deleted user', async () => {
    mocks.findUserByEmail.mockResolvedValueOnce({
      id: 7n,
      name: 'Gone',
      email: 'gone@example.com',
      role: 'visitor',
      password: 'hashed',
      deletedAt: new Date(),
    } as never)

    const result = await requestPasswordReset(db, CLIENT, request(), formWith({ email: 'gone@example.com' }), resetDeps)

    expect(result).toEqual({ type: 'success', message: GENERIC })
    expect(mocks.issueResetToken).not.toHaveBeenCalled()
    expect(mocks.sendPasswordReset).not.toHaveBeenCalled()
  })

  it('does NOT upgrade an anonymous commenter without any approved comment', async () => {
    mocks.findUserByEmail.mockResolvedValueOnce({
      id: 8n,
      name: 'Anon',
      email: 'anon@example.com',
      role: null,
      password: '',
      deletedAt: null,
    } as never)
    mocks.hasApprovedComments.mockResolvedValueOnce(false)

    const result = await requestPasswordReset(db, CLIENT, request(), formWith({ email: 'anon@example.com' }), resetDeps)

    expect(result).toEqual({ type: 'success', message: GENERIC })
    expect(mocks.hasApprovedComments).toHaveBeenCalledWith(db, 8n)
    expect(mocks.updateUserById).not.toHaveBeenCalled()
    expect(mocks.issueResetToken).not.toHaveBeenCalled()
    expect(mocks.sendPasswordReset).not.toHaveBeenCalled()
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled()
  })

  it('claims the account (role → visitor) before emailing when ≥1 approved comment exists', async () => {
    mocks.findUserByEmail.mockResolvedValueOnce({
      id: 8n,
      name: 'Anon',
      email: 'anon@example.com',
      role: null,
      password: '',
      deletedAt: null,
    } as never)
    mocks.hasApprovedComments.mockResolvedValueOnce(true)

    const result = await requestPasswordReset(db, CLIENT, request(), formWith({ email: 'anon@example.com' }), resetDeps)

    expect(result).toEqual({ type: 'success', message: GENERIC })
    expect(mocks.updateUserById).toHaveBeenCalledWith(db, 8n, { role: 'visitor' })
    // The role upgrade must land before the token is issued.
    expect(mocks.updateUserById.mock.invocationCallOrder[0]!).toBeLessThan(
      mocks.issueResetToken.mock.invocationCallOrder[0]!,
    )
    expect(mocks.sendPasswordReset).toHaveBeenCalledTimes(1)
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'password_reset_requested', actorId: 8n, actorRole: 'visitor' }),
    )
  })
})

describe('auth/password-flow — resetPasswordWithToken', () => {
  const validForm = () => formWith({ reset_token: 'tok-abc', password: 'LongEnough1' })

  it('rejects a short password before consuming the token', async () => {
    const result = await resetPasswordWithToken(
      flowCtx(),
      request(),
      formWith({ reset_token: 'tok-abc', password: 'Sh0rt' }),
      '/admin',
      'password-reset',
    )

    expect(result.type).toBe('error')
    if (result.type === 'error') {
      expect(result.message).toContain('密码长度至少')
    }
    expect(mocks.consumeToken).not.toHaveBeenCalled()
  })

  it('rejects a password that fails the complexity rule', async () => {
    const result = await resetPasswordWithToken(
      flowCtx(),
      request(),
      formWith({ reset_token: 'tok-abc', password: 'alllowercase1' }),
      '/admin',
      'password-reset',
    )

    expect(result).toEqual({ type: 'error', message: '密码必须包含至少一个大写字母、一个小写字母和一个数字。' })
    expect(mocks.consumeToken).not.toHaveBeenCalled()
  })

  it('returns 链接无效或已过期 when the token does not consume', async () => {
    mocks.consumeToken.mockResolvedValueOnce(null)

    const result = await resetPasswordWithToken(flowCtx(), request(), validForm(), '/admin', 'password-reset')

    expect(result).toEqual({ type: 'error', message: '链接无效或已过期。' })
    expect(mocks.establishLoginSession).not.toHaveBeenCalled()
  })

  it('passes the intent purpose through to consumeToken (accept-invite)', async () => {
    mocks.consumeToken.mockResolvedValueOnce(null)

    await resetPasswordWithToken(flowCtx(), request(), validForm(), '/admin', 'author-invite')

    expect(mocks.consumeToken).toHaveBeenCalledWith(db, 'tok-abc', 'author-invite')
  })

  it('on success: rehashes, clears passkeys, revokes other sessions, audits, redirects', async () => {
    mocks.consumeToken.mockResolvedValueOnce({ userId: 42n })
    mocks.findUserById.mockResolvedValueOnce({
      id: 42n,
      name: 'Vis',
      email: 'vis@example.com',
      role: 'visitor',
      deletedAt: null,
    } as never)

    const req = request()
    const result = await resetPasswordWithToken(flowCtx(), req, validForm(), '/admin', 'password-reset')

    expect(result).toEqual({ type: 'redirect', to: '/admin', setCookie: '__session=abc' })

    // Password stored as a bcrypt hash of the new password, login method
    // reverted to password.
    expect(mocks.updateUserById).toHaveBeenCalledTimes(1)
    const patch = mocks.updateUserById.mock.calls[0]![2] as { password: string; loginMethod: string }
    expect(patch.loginMethod).toBe('password')
    expect(await bcrypt.compare('LongEnough1', patch.password)).toBe(true)

    // Passkey cleanup runs after the password update, before the session
    // is established with revokeOtherSessions.
    expect(mocks.deleteAllCredentials).toHaveBeenCalledWith(db, 42n)
    expect(mocks.updateUserById.mock.invocationCallOrder[0]!).toBeLessThan(
      mocks.deleteAllCredentials.mock.invocationCallOrder[0]!,
    )
    expect(mocks.deleteAllCredentials.mock.invocationCallOrder[0]!).toBeLessThan(
      mocks.establishLoginSession.mock.invocationCallOrder[0]!,
    )
    expect(mocks.establishLoginSession).toHaveBeenCalledWith(
      db,
      session,
      expect.objectContaining({ id: 42n }),
      req,
      CLIENT,
      {
        revokeOtherSessions: true,
      },
    )

    expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1)
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'password_reset_complete',
        resourceType: 'user',
        resourceId: '42',
        actorId: 42n,
        actorRole: 'visitor',
      }),
    )
  })

  it('still succeeds when passkey cleanup fails (best-effort)', async () => {
    mocks.consumeToken.mockResolvedValueOnce({ userId: 42n })
    mocks.deleteAllCredentials.mockRejectedValueOnce(new Error('db down'))
    mocks.findUserById.mockResolvedValueOnce({
      id: 42n,
      name: 'Vis',
      email: 'vis@example.com',
      role: 'visitor',
      deletedAt: null,
    } as never)

    const result = await resetPasswordWithToken(flowCtx(), request(), validForm(), '/admin', 'password-reset')

    expect(result.type).toBe('redirect')
    expect(mocks.establishLoginSession).toHaveBeenCalled()
  })

  it('returns 账户状态异常 when the user is gone after token consume', async () => {
    mocks.consumeToken.mockResolvedValueOnce({ userId: 42n })
    mocks.findUserById.mockResolvedValueOnce(null)

    const result = await resetPasswordWithToken(flowCtx(), request(), validForm(), '/admin', 'password-reset')

    expect(result).toEqual({ type: 'error', message: '账户状态异常，无法登录。' })
    expect(mocks.establishLoginSession).not.toHaveBeenCalled()
  })
})
