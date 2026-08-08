import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SigninFlowContext } from '@/server/domains/auth/services/shared'
import type { BlogSession } from '@/server/domains/auth/session-storage'
import type { BlogSettingsBundle } from '@/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeSession } from '#/_helpers/session'
import { getDatabaseHandle } from '@/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@/server/domains/audit/services/batcher'
import { requestPasswordReset, resetPasswordWithToken } from '@/server/domains/auth/services/password-reset'
import { issueResetToken, issueSetupToken, peekToken } from '@/server/domains/auth/verification-tokens'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'
import { auditLog } from '@/server/infra/db/schema/config'
import { passkeyCredential } from '@/server/infra/db/schema/passkey'
import { session as sessionTable } from '@/server/infra/db/schema/session'
import { user as userTable, verification } from '@/server/infra/db/schema/user'
import { __rateLimitKeysForTests, __resetRateLimitsForTests } from '@/server/infra/rate-limit'

// auth/password-flow against the real engine; only mocks:
// sendPasswordReset (email is external), hasApprovedComments (an
// injected flow dependency), deleteAllCredentials (failure seeding).

const mocks = vi.hoisted(() => ({
  sendPasswordReset: vi.fn<(user: unknown, link: string) => Promise<{ ok: boolean }>>(async () => ({ ok: true })),
  deleteAllCredentials: vi.fn(),
}))

vi.mock('@/server/infra/email/sender', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/infra/email/sender')>()
  return {
    ...actual,
    sendPasswordReset: mocks.sendPasswordReset,
  }
})

vi.mock('@/server/domains/auth/passkey/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/domains/auth/passkey/service')>()
  mocks.deleteAllCredentials.mockImplementation(actual.deleteAllCredentials)
  return {
    ...actual,
    deleteAllCredentials: mocks.deleteAllCredentials,
  }
})

const db = getTestDb()
const CLIENT = '203.0.113.7'
const GENERIC = '如果该邮箱存在且符合要求，重置邮件已发送。'

const hasApprovedComments = vi.fn(async (_db: unknown, _userId: number) => false)
const resetDeps = { hasApprovedComments }

function withResetBucket(bucket: 'passwordResetIp' | 'passwordResetEmail', maxAttempts: number): BlogSettingsBundle {
  return {
    ...TEST_BLOG_SETTINGS_BUNDLE,
    rateLimit: {
      ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit!,
      [bucket]: { windowSeconds: 60, maxAttempts },
    },
  } as BlogSettingsBundle
}

async function seedUser(overrides: Record<string, unknown> = {}): Promise<number> {
  const hashed = await bcrypt.hash('OldPassword1', 4)
  const [inserted] = await db
    .insert(userTable)
    .values({
      name: 'Vis',
      email: `vis-${crypto.randomUUID()}@example.com`,
      password: hashed,
      role: 'visitor',
      ...overrides,
    })
    .returning({ id: userTable.id })
  return inserted!.id
}

async function userRow(id: number) {
  const [row] = await db.select().from(userTable).where(eq(userTable.id, id))
  return row
}

async function resetTokenRow(userId: number) {
  const rows = await db
    .select()
    .from(verification)
    .where(and(eq(verification.purpose, 'password-reset'), eq(verification.userId, userId)))
  return rows[0]
}

async function auditRowsFor(action: string) {
  await flushAuditLog()
  return db.select().from(auditLog).where(eq(auditLog.action, action))
}

function flowCtx(session: BlogSession): SigninFlowContext {
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

beforeEach(async () => {
  initAllBatchers(getDatabaseHandle())
  await clearAllTables(db)
  __resetRateLimitsForTests()
  vi.clearAllMocks()
  mocks.sendPasswordReset.mockResolvedValue({ ok: true })
  mocks.deleteAllCredentials.mockClear()
  hasApprovedComments.mockResolvedValue(false)
})

afterEach(async () => {
  // Flush BEFORE dropping the batcher: an armed flush timer would insert after the wipe.
  await flushAuditLog()
  resetAllBatchers()
})

describe('auth/password-flow — requestPasswordReset (real db + tokens)', () => {
  it('short-circuits with the generic success when the per-IP limit trips (no token, no email, no audit)', async () => {
    setBlogSettingsBundleForTests(withResetBucket('passwordResetIp', 1))
    const userId = await seedUser({ email: 'a@example.com' })

    // First reach consumes the single-slot budget.
    await requestPasswordReset(db, CLIENT, request(), formWith({ email: 'a@example.com' }), resetDeps)
    mocks.sendPasswordReset.mockClear()

    const result = await requestPasswordReset(db, CLIENT, request(), formWith({ email: 'a@example.com' }), resetDeps)

    expect(result).toEqual({ type: 'success', message: GENERIC })
    expect(mocks.sendPasswordReset).not.toHaveBeenCalled()
    // Exactly one token total (from the first, unthrottled call).
    expect(await db.select().from(verification)).toHaveLength(1)
    expect(await auditRowsFor('password_reset_requested')).toHaveLength(1)
    void userId
  })

  it('short-circuits with the generic success when the per-email limit trips', async () => {
    setBlogSettingsBundleForTests(withResetBucket('passwordResetEmail', 1))
    await seedUser({ email: 'a@example.com' })

    await requestPasswordReset(db, CLIENT, request(), formWith({ email: 'a@example.com' }), resetDeps)
    mocks.sendPasswordReset.mockClear()

    // A second request for the same mailbox — even another IP — trips the bucket.
    const result = await requestPasswordReset(
      db,
      '198.51.100.9',
      request(),
      formWith({ email: 'a@example.com' }),
      resetDeps,
    )

    expect(result).toEqual({ type: 'success', message: GENERIC })
    expect(mocks.sendPasswordReset).not.toHaveBeenCalled()
    expect(await db.select().from(verification)).toHaveLength(1)
  })

  it('skips the per-email bucket when the form has no email', async () => {
    const result = await requestPasswordReset(db, CLIENT, request(), formWith({}), resetDeps)

    expect(result).toEqual({ type: 'success', message: GENERIC })
    expect(__rateLimitKeysForTests().some((key) => key.includes('password-reset-email'))).toBe(false)
    expect(mocks.sendPasswordReset).not.toHaveBeenCalled()
  })

  it('issues one real token, sends one email, and audits once for an existing user', async () => {
    const userId = await seedUser({ email: 'vis@example.com' })

    const result = await requestPasswordReset(db, CLIENT, request(), formWith({ email: 'vis@example.com' }), resetDeps)

    expect(result).toEqual({ type: 'success', message: GENERIC })

    const row = await resetTokenRow(userId)
    expect(row).toBeDefined()

    // Link carries the raw token over the configured origin; the token resolves.
    expect(mocks.sendPasswordReset).toHaveBeenCalledTimes(1)
    const [sentUser, link] = mocks.sendPasswordReset.mock.calls[0]! as [{ email: string }, string]
    expect(sentUser.email).toBe('vis@example.com')
    const url = new URL(link)
    expect(url.origin).toBe('https://example.com')
    expect(url.pathname).toBe('/admin/signin')
    expect(url.searchParams.get('action')).toBe('resetpassword')
    const rawToken = url.searchParams.get('token')!
    expect(await peekToken(db, rawToken, 'password-reset')).toEqual({ userId })

    const audits = await auditRowsFor('password_reset_requested')
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      resourceType: 'user',
      resourceId: String(userId),
      actorId: userId,
      actorRole: 'visitor',
      ipAddress: CLIENT,
      userAgent: 'vitest',
    })
  })

  it('falls back to the request origin when no site website is configured', async () => {
    setBlogSettingsBundleForTests(undefined)
    await seedUser({ email: 'vis@example.com' })

    await requestPasswordReset(db, CLIENT, request(), formWith({ email: 'vis@example.com' }), resetDeps)

    const [, link] = mocks.sendPasswordReset.mock.calls[0]! as [unknown, string]
    expect(new URL(link).origin).toBe('http://localhost')
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
    expect(await db.select().from(verification)).toHaveLength(0)
    expect(mocks.sendPasswordReset).not.toHaveBeenCalled()
    expect(await auditRowsFor('password_reset_requested')).toHaveLength(0)
  })

  it('stays silent for a deleted user', async () => {
    await seedUser({ email: 'gone@example.com', deletedAt: new Date() })

    const result = await requestPasswordReset(db, CLIENT, request(), formWith({ email: 'gone@example.com' }), resetDeps)

    expect(result).toEqual({ type: 'success', message: GENERIC })
    expect(await db.select().from(verification)).toHaveLength(0)
    expect(mocks.sendPasswordReset).not.toHaveBeenCalled()
  })

  it('does NOT upgrade an anonymous commenter without any approved comment', async () => {
    const userId = await seedUser({ email: 'anon@example.com', role: null, password: '' })
    hasApprovedComments.mockResolvedValue(false)

    const result = await requestPasswordReset(db, CLIENT, request(), formWith({ email: 'anon@example.com' }), resetDeps)

    expect(result).toEqual({ type: 'success', message: GENERIC })
    expect(hasApprovedComments).toHaveBeenCalledWith(db, userId)
    expect((await userRow(userId))!.role).toBeNull()
    expect(await db.select().from(verification)).toHaveLength(0)
    expect(mocks.sendPasswordReset).not.toHaveBeenCalled()
    expect(await auditRowsFor('password_reset_requested')).toHaveLength(0)
  })

  it('claims the account (role → visitor) before emailing when ≥1 approved comment exists', async () => {
    const userId = await seedUser({ email: 'anon@example.com', role: null, password: '' })
    hasApprovedComments.mockResolvedValue(true)

    const result = await requestPasswordReset(db, CLIENT, request(), formWith({ email: 'anon@example.com' }), resetDeps)

    expect(result).toEqual({ type: 'success', message: GENERIC })
    // These pin the upgrade-before-issue ordering.
    expect((await userRow(userId))!.role).toBe('visitor')
    expect(await resetTokenRow(userId)).toBeDefined()
    expect(mocks.sendPasswordReset).toHaveBeenCalledTimes(1)
    const audits = await auditRowsFor('password_reset_requested')
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({ actorId: userId, actorRole: 'visitor' })
  })
})

describe('auth/password-flow — resetPasswordWithToken (real db + tokens)', () => {
  const validForm = (token: string) => formWith({ reset_token: token, password: 'LongEnough1' })

  it('rejects a short password before consuming the token', async () => {
    const userId = await seedUser()
    const { token } = issueResetToken(db, userId)

    const result = await resetPasswordWithToken(
      flowCtx(makeSession({})),
      request(),
      formWith({ reset_token: token, password: 'Sh0rt' }),
      '/admin',
      'password-reset',
    )

    expect(result.type).toBe('error')
    if (result.type === 'error') {
      expect(result.message).toContain('密码长度至少')
    }
    // The token is still live — validation ran before the consume.
    expect(await peekToken(db, token, 'password-reset')).toEqual({ userId })
  })

  it('rejects a password that fails the complexity rule before consuming the token', async () => {
    const userId = await seedUser()
    const { token } = issueResetToken(db, userId)

    const result = await resetPasswordWithToken(
      flowCtx(makeSession({})),
      request(),
      formWith({ reset_token: token, password: 'alllowercase1' }),
      '/admin',
      'password-reset',
    )

    expect(result).toEqual({ type: 'error', message: '密码必须包含至少一个大写字母、一个小写字母和一个数字。' })
    expect(await peekToken(db, token, 'password-reset')).toEqual({ userId })
  })

  it('returns 链接无效或已过期 when the token does not consume', async () => {
    const result = await resetPasswordWithToken(
      flowCtx(makeSession({})),
      request(),
      validForm('bogus-token'),
      '/admin',
      'password-reset',
    )

    expect(result).toEqual({ type: 'error', message: '链接无效或已过期。' })
    expect(await db.select().from(sessionTable)).toHaveLength(0)
  })

  it('passes the intent purpose through to the token consume (author-invite)', async () => {
    const userId = await seedUser()
    const { token } = issueSetupToken(db, userId)

    const result = await resetPasswordWithToken(
      flowCtx(makeSession({})),
      request(),
      validForm(token),
      '/admin',
      'author-invite',
    )

    expect(result.type).toBe('redirect')
  })

  it('rejects an author-invite token under the password-reset purpose (and the consume stays destructive)', async () => {
    const userId = await seedUser()
    const { token } = issueSetupToken(db, userId)

    const wrongPurpose = await resetPasswordWithToken(
      flowCtx(makeSession({})),
      request(),
      validForm(token),
      '/admin',
      'password-reset',
    )

    expect(wrongPurpose).toEqual({ type: 'error', message: '链接无效或已过期。' })
    // Single-shot consume: the mismatched attempt already burned the row.
    const retry = await resetPasswordWithToken(
      flowCtx(makeSession({})),
      request(),
      validForm(token),
      '/admin',
      'author-invite',
    )
    expect(retry).toEqual({ type: 'error', message: '链接无效或已过期。' })
  })

  it('on success: rehashes, clears passkeys, revokes other sessions, audits, redirects', async () => {
    const userId = await seedUser({ loginMethod: 'passkey' })
    await db.insert(passkeyCredential).values({
      userId,
      credentialId: 'cred-1',
      publicKey: Buffer.from([1, 2, 3]),
      counter: 0,
      transports: [],
    })
    // Two pre-existing sessions — the reset invariant must destroy both.
    for (const sid of ['old-sid-1', 'old-sid-2']) {
      await db.insert(sessionTable).values({
        id: sid,
        userId,
        data: {},
        expiresAt: new Date(Date.now() + 3_600_000),
      })
    }
    const { token } = issueResetToken(db, userId)

    const result = await resetPasswordWithToken(
      flowCtx(makeSession({})),
      request(),
      validForm(token),
      '/admin',
      'password-reset',
    )

    expect(result.type).toBe('redirect')
    if (result.type !== 'redirect') {
      throw new Error('expected redirect')
    }
    expect(result.to).toBe('/admin')
    expect(result.setCookie).toMatch(/^__session=/)

    // Password stored as a real bcrypt hash; login method reverted.
    const row = (await userRow(userId))!
    expect(await bcrypt.compare('LongEnough1', row.password)).toBe(true)
    expect(row.loginMethod).toBe('password')

    // Passkey cleanup ran through the real service.
    expect(mocks.deleteAllCredentials).toHaveBeenCalledWith(db, userId)
    expect(await db.select().from(passkeyCredential).where(eq(passkeyCredential.userId, userId))).toHaveLength(0)

    // Reset invariant: both old sessions destroyed, one new session owned.
    const sessions = await db.select().from(sessionTable)
    expect(sessions).toHaveLength(1)
    expect(sessions[0]!.userId).toBe(userId)
    expect(['old-sid-1', 'old-sid-2']).not.toContain(sessions[0]!.id)

    // Single-use: the token row is gone.
    expect(await resetTokenRow(userId)).toBeUndefined()

    // Both the completion audit and the session-establish login audit.
    const completes = await auditRowsFor('password_reset_complete')
    expect(completes).toHaveLength(1)
    expect(completes[0]).toMatchObject({
      resourceType: 'user',
      resourceId: String(userId),
      actorId: userId,
      actorRole: 'visitor',
    })
    const logins = await auditRowsFor('login')
    expect(logins).toHaveLength(1)
  })

  it('still succeeds when passkey cleanup fails (best-effort)', async () => {
    const userId = await seedUser()
    mocks.deleteAllCredentials.mockRejectedValueOnce(new Error('db down'))
    const { token } = issueResetToken(db, userId)

    const result = await resetPasswordWithToken(
      flowCtx(makeSession({})),
      request(),
      validForm(token),
      '/admin',
      'password-reset',
    )

    expect(result.type).toBe('redirect')
    // The password rotation still landed.
    const row = (await userRow(userId))!
    expect(await bcrypt.compare('LongEnough1', row.password)).toBe(true)
  })

  it('returns 账户状态异常 when the user is gone after token consume', async () => {
    const userId = await seedUser()
    const { token } = issueResetToken(db, userId)
    // No FK on verification: the token row survives the hard-deleted user.
    await db.delete(userTable).where(eq(userTable.id, userId))

    const result = await resetPasswordWithToken(
      flowCtx(makeSession({})),
      request(),
      validForm(token),
      '/admin',
      'password-reset',
    )

    expect(result).toEqual({ type: 'error', message: '账户状态异常，无法登录。' })
    expect(await db.select().from(sessionTable)).toHaveLength(0)
  })
})
