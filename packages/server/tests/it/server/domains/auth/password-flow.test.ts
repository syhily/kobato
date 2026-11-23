import type { SigninFlowContext } from '@kobato/server/domains/auth/services/shared'
import type { BlogSession } from '@kobato/server/domains/auth/session-storage'
import type { BlogSettingsBundle } from '@kobato/settings/types'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { auditLog } from '@kobato/db/sqlite/schema/config'
import { passkeyCredential } from '@kobato/db/sqlite/schema/passkey'
import { session as sessionTable } from '@kobato/db/sqlite/schema/session'
import { user as userTable, verification } from '@kobato/db/sqlite/schema/user'
import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@kobato/server/domains/audit/services/batcher'
import { requestPasswordReset, resetPasswordWithToken } from '@kobato/server/domains/auth/services/password-reset'
import {
  issueOtpToken,
  issueResetToken,
  issueSetupToken,
  issueSignInLinkToken,
  peekToken,
} from '@kobato/server/domains/auth/verification-tokens'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry'
import { __rateLimitKeysForTests, __resetRateLimitsForTests } from '@kobato/server/infra/rate-limit'
import { createCaptureMailFixture } from '@kobato/server/tests/utils/capture-mail'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makeSession } from '@kobato/server/tests/utils/session'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/settings/tests/utils/blog-settings'
import bcrypt from 'bcryptjs'
import { and, eq, sql } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = getTestDb()
const CLIENT = '203.0.113.7'
const GENERIC_KEY = 'auth.passwordReset.sent'

const hasApprovedComments = vi.fn(async (_db: unknown, _userId: number) => false)
const resetDeps = { hasApprovedComments }

function withResetBucket(maxAttempts: number): BlogSettingsBundle {
  return {
    ...TEST_BLOG_SETTINGS_BUNDLE,
    rateLimit: {
      ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit!,
      passwordReset: { windowSeconds: 60, maxAttempts },
    },
  } as BlogSettingsBundle
}

async function seedUser(overrides: Record<string, unknown> = {}): Promise<number> {
  const hashed = await bcrypt.hash('OldPassword1', 4)
  const [inserted] = await sqliteOf(db)
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
  const [row] = await sqliteOf(db).select().from(userTable).where(eq(userTable.id, id))
  return row
}

async function resetTokenRow(userId: number) {
  const rows = await sqliteOf(db)
    .select()
    .from(verification)
    .where(and(eq(verification.purpose, 'password-reset'), eq(verification.userId, userId)))
  return rows[0]
}

async function auditRowsFor(action: string) {
  await flushAuditLog()
  return sqliteOf(db).select().from(auditLog).where(eq(auditLog.action, action))
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

const mail = await createCaptureMailFixture()

async function resetLinkFromMail(): Promise<URL> {
  const message = await mail.nextMessage()
  let body = message.raw
  if (/Content-Transfer-Encoding: base64/i.test(body)) {
    const payload = body
      .split(/\r?\n\r?\n/)
      .slice(1)
      .join('')
      .replace(/[^A-Za-z0-9+/=]/g, '')
    body = Buffer.from(payload, 'base64').toString('utf8')
  } else {
    body = body.replace(/[=]\r?\n/g, '').replace(/[=]3D/gi, '=')
  }
  const decoded = body.replace(/&amp;/g, '&')
  const match = /(?:https?:\/\/[^\s"'<]*)?\/admin\/signin[^\s"'<]*token=[^\s"'<]+/.exec(decoded)
  expect(match).not.toBeNull()
  return new URL(match![0]!, 'http://fallback.local')
}

beforeEach(async () => {
  initAllBatchers(getDatabaseHandle())
  await clearAllTables(db)
  __resetRateLimitsForTests()
  vi.clearAllMocks()
  mail.useCapture()
  hasApprovedComments.mockResolvedValue(false)
})

afterEach(async () => {
  await flushAuditLog()
  resetAllBatchers()
  mail.restore()
})

afterAll(async () => {
  await mail.close()
})

describe('auth/password-flow — requestPasswordReset (real db + tokens)', () => {
  it('short-circuits with the generic success when the per-IP limit trips (no token, no email, no audit)', async () => {
    setBlogSettingsBundleForTests(withResetBucket(1))
    const userId = await seedUser({ email: 'a@example.com' })

    await requestPasswordReset(db, CLIENT, request(), formWith({ email: 'a@example.com' }), resetDeps)

    const result = await requestPasswordReset(db, CLIENT, request(), formWith({ email: 'a@example.com' }), resetDeps)

    expect(result).toMatchObject({ type: 'success', descriptor: { messageKey: GENERIC_KEY } })
    expect(await mail.noMessage()).toBe(true)
    expect(await sqliteOf(db).select().from(verification)).toHaveLength(1)
    expect(await auditRowsFor('password_reset_requested')).toHaveLength(1)
    void userId
  })

  it('short-circuits with the generic success when the per-email limit trips', async () => {
    setBlogSettingsBundleForTests(withResetBucket(1))
    await seedUser({ email: 'a@example.com' })

    await requestPasswordReset(db, CLIENT, request(), formWith({ email: 'a@example.com' }), resetDeps)

    const result = await requestPasswordReset(
      db,
      '198.51.100.9',
      request(),
      formWith({ email: 'a@example.com' }),
      resetDeps,
    )

    expect(result).toMatchObject({ type: 'success', descriptor: { messageKey: GENERIC_KEY } })
    expect(await mail.noMessage()).toBe(true)
    expect(await sqliteOf(db).select().from(verification)).toHaveLength(1)
  })

  it('skips the per-email bucket when the form has no email', async () => {
    const result = await requestPasswordReset(db, CLIENT, request(), formWith({}), resetDeps)

    expect(result).toMatchObject({ type: 'success', descriptor: { messageKey: GENERIC_KEY } })
    expect(__rateLimitKeysForTests().some((key) => key.includes('password-reset-email'))).toBe(false)
    expect(await mail.noMessage()).toBe(true)
  })

  it('issues one real token, sends one email, and audits once for an existing user', async () => {
    const userId = await seedUser({ email: 'vis@example.com' })

    const result = await requestPasswordReset(db, CLIENT, request(), formWith({ email: 'vis@example.com' }), resetDeps)

    expect(result).toMatchObject({ type: 'success', descriptor: { messageKey: GENERIC_KEY } })

    const row = await resetTokenRow(userId)
    expect(row).toBeDefined()

    const url = await resetLinkFromMail()
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
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, website: '' },
    })
    mail.applyCaptureMail()
    await seedUser({ email: 'vis@example.com' })

    await requestPasswordReset(db, CLIENT, request(), formWith({ email: 'vis@example.com' }), resetDeps)

    const url = await resetLinkFromMail()
    expect(url.pathname).toBe('/admin/signin')
    expect(url.searchParams.get('action')).toBe('resetpassword')
  })

  it('stays silent for an unknown email (enumeration-safe)', async () => {
    const result = await requestPasswordReset(
      db,
      CLIENT,
      request(),
      formWith({ email: 'ghost@example.com' }),
      resetDeps,
    )

    expect(result).toMatchObject({ type: 'success', descriptor: { messageKey: GENERIC_KEY } })
    expect(await sqliteOf(db).select().from(verification)).toHaveLength(0)
    expect(await mail.noMessage()).toBe(true)
    expect(await auditRowsFor('password_reset_requested')).toHaveLength(0)
  })

  it('stays silent for a deleted user', async () => {
    await seedUser({ email: 'gone@example.com', deletedAt: new Date() })

    const result = await requestPasswordReset(db, CLIENT, request(), formWith({ email: 'gone@example.com' }), resetDeps)

    expect(result).toMatchObject({ type: 'success', descriptor: { messageKey: GENERIC_KEY } })
    expect(await sqliteOf(db).select().from(verification)).toHaveLength(0)
    expect(await mail.noMessage()).toBe(true)
  })

  it('does NOT upgrade an anonymous commenter without any approved comment', async () => {
    const userId = await seedUser({ email: 'anon@example.com', role: null, password: '' })
    hasApprovedComments.mockResolvedValue(false)

    const result = await requestPasswordReset(db, CLIENT, request(), formWith({ email: 'anon@example.com' }), resetDeps)

    expect(result).toMatchObject({ type: 'success', descriptor: { messageKey: GENERIC_KEY } })
    expect(hasApprovedComments).toHaveBeenCalledWith(db, userId)
    expect((await userRow(userId))!.role).toBeNull()
    expect(await sqliteOf(db).select().from(verification)).toHaveLength(0)
    expect(await mail.noMessage()).toBe(true)
    expect(await auditRowsFor('password_reset_requested')).toHaveLength(0)
  })

  it('claims the account (role → visitor) before emailing when ≥1 approved comment exists', async () => {
    const userId = await seedUser({ email: 'anon@example.com', role: null, password: '' })
    hasApprovedComments.mockResolvedValue(true)

    const result = await requestPasswordReset(db, CLIENT, request(), formWith({ email: 'anon@example.com' }), resetDeps)

    expect(result).toMatchObject({ type: 'success', descriptor: { messageKey: GENERIC_KEY } })
    expect((await userRow(userId))!.role).toBe('visitor')
    expect(await resetTokenRow(userId)).toBeDefined()
    expect((await mail.nextMessage()).to).toContain('anon@example.com')
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
      expect(result.descriptor).toMatchObject({
        messageKey: 'auth.passwordReset.error.passwordTooShort',
        params: { min: 10 },
      })
    }
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

    expect(result).toMatchObject({
      type: 'error',
      descriptor: { messageKey: 'auth.passwordReset.error.passwordComplexity' },
    })
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

    expect(result).toMatchObject({ type: 'error', descriptor: { messageKey: 'auth.signin.error.invalidToken' } })
    expect(await sqliteOf(db).select().from(sessionTable)).toHaveLength(0)
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

    expect(wrongPurpose).toMatchObject({ type: 'error', descriptor: { messageKey: 'auth.signin.error.invalidToken' } })
    const retry = await resetPasswordWithToken(
      flowCtx(makeSession({})),
      request(),
      validForm(token),
      '/admin',
      'author-invite',
    )
    expect(retry).toMatchObject({ type: 'error', descriptor: { messageKey: 'auth.signin.error.invalidToken' } })
  })

  it('on success: rehashes, clears passkeys, revokes other sessions, audits, redirects', async () => {
    const userId = await seedUser({ loginMethod: 'passkey' })
    await sqliteOf(db)
      .insert(passkeyCredential)
      .values({
        userId,
        credentialId: 'cred-1',
        publicKey: Buffer.from([1, 2, 3]),
        counter: 0,
        transports: [],
      })
    for (const sid of ['old-sid-1', 'old-sid-2']) {
      await sqliteOf(db)
        .insert(sessionTable)
        .values({
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

    const row = (await userRow(userId))!
    expect(await bcrypt.compare('LongEnough1', row.password)).toBe(true)
    expect(row.loginMethod).toBe('password')

    expect(
      await sqliteOf(db).select().from(passkeyCredential).where(eq(passkeyCredential.userId, userId)),
    ).toHaveLength(0)

    const sessions = await sqliteOf(db).select().from(sessionTable)
    expect(sessions).toHaveLength(1)
    expect(sessions[0]!.userId).toBe(userId)
    expect(['old-sid-1', 'old-sid-2']).not.toContain(sessions[0]!.id)

    expect(await resetTokenRow(userId)).toBeUndefined()

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

  it('on success: also kills outstanding magic-link and OTP tokens', async () => {
    const userId = await seedUser()
    const { token: magicToken } = issueSignInLinkToken(db, userId)
    await issueOtpToken(db, userId)
    const { token } = issueResetToken(db, userId)

    const result = await resetPasswordWithToken(
      flowCtx(makeSession({})),
      request(),
      validForm(token),
      '/admin',
      'password-reset',
    )

    expect(result.type).toBe('redirect')
    expect(await peekToken(db, magicToken, 'signin-link')).toBeNull()
    expect(
      await sqliteOf(db)
        .select()
        .from(verification)
        .where(and(eq(verification.purpose, 'signin-otp'), eq(verification.userId, userId))),
    ).toHaveLength(0)
  })

  it('rejects a password past the 72-byte bcrypt cap before consuming the token', async () => {
    const userId = await seedUser()
    const { token } = issueResetToken(db, userId)

    const result = await resetPasswordWithToken(
      flowCtx(makeSession({})),
      request(),
      formWith({ reset_token: token, password: `${'Aa1'.repeat(24)}x` }),
      '/admin',
      'password-reset',
    )

    expect(result.type).toBe('error')
    if (result.type === 'error') {
      expect(result.descriptor).toMatchObject({
        messageKey: 'auth.passwordReset.error.passwordTooLong',
        params: { max: 72 },
      })
    }
    expect(await peekToken(db, token, 'password-reset')).toEqual({ userId })
  })

  it('still succeeds when passkey cleanup fails (best-effort)', async () => {
    const userId = await seedUser()
    const ddlRows = await sqliteOf(db).all<{ type: string; name: string; sql: string }>(
      sql`SELECT type, name, sql FROM sqlite_master WHERE tbl_name = 'passkey_credential' AND sql IS NOT NULL ORDER BY type = 'index', name`,
    )
    expect(ddlRows.length).toBeGreaterThan(0)
    await sqliteOf(db).run(sql`DROP TABLE passkey_credential`)
    try {
      const { token } = issueResetToken(db, userId)

      const result = await resetPasswordWithToken(
        flowCtx(makeSession({})),
        request(),
        validForm(token),
        '/admin',
        'password-reset',
      )

      expect(result.type).toBe('redirect')
      const row = (await userRow(userId))!
      expect(await bcrypt.compare('LongEnough1', row.password)).toBe(true)
    } finally {
      for (const ddlRow of ddlRows) {
        await sqliteOf(db).run(sql.raw(ddlRow.sql))
      }
    }
  })

  it('returns 账户状态异常 when the user is gone after token consume', async () => {
    const userId = await seedUser()
    const { token } = issueResetToken(db, userId)
    await sqliteOf(db).delete(userTable).where(eq(userTable.id, userId))

    const result = await resetPasswordWithToken(
      flowCtx(makeSession({})),
      request(),
      validForm(token),
      '/admin',
      'password-reset',
    )

    expect(result).toMatchObject({
      type: 'error',
      descriptor: { messageKey: 'auth.signin.error.accountCannotSignIn' },
    })
    expect(await sqliteOf(db).select().from(sessionTable)).toHaveLength(0)
  })
})
