import { call } from '@orpc/server'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '@/server/infra/db/database'
import type { BlogSettingsBundle, RateLimitSettings } from '@/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { getDatabaseHandle } from '@/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@/server/domains/audit/services/batcher'
import { accountRouter } from '@/server/http/controllers/account.controller'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'
import { auditLog } from '@/server/infra/db/schema/config'
import { oneTimeToken } from '@/server/infra/db/schema/one-time-token'
import { passkeyCredential } from '@/server/infra/db/schema/passkey'
import { session as sessionTable } from '@/server/infra/db/schema/session'
import { user as userTable } from '@/server/infra/db/schema/user'
import { __resetRateLimitsForTests } from '@/server/infra/rate-limit'

// The account controller against the real engine: seeded user/session/
// credential rows, the real in-process rate limiter, the real settings-
// driven passkey/mail gates, and the real audit batcher. The only stub
// is `@simplewebauthn/server` — the WebAuthn attestation crypto is a
// true external that cannot produce a genuine ceremony in tests.
const swaMocks = vi.hoisted(() => ({
  generateRegistrationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}))

vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn((...args: unknown[]) => swaMocks.generateRegistrationOptions(...args)),
  verifyRegistrationResponse: vi.fn((...args: unknown[]) => swaMocks.verifyRegistrationResponse(...args)),
  generateAuthenticationOptions: vi.fn((...args: unknown[]) => swaMocks.generateAuthenticationOptions(...args)),
  verifyAuthenticationResponse: vi.fn((...args: unknown[]) => swaMocks.verifyAuthenticationResponse(...args)),
}))

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
  initAllBatchers(getDatabaseHandle())
  __resetRateLimitsForTests()
  vi.clearAllMocks()
})

afterEach(() => {
  resetAllBatchers()
})

// ─── Settings bundles ─────────────────────────────────────

const PASSKEY_ON: BlogSettingsBundle = {
  ...TEST_BLOG_SETTINGS_BUNDLE,
  security: { ...TEST_BLOG_SETTINGS_BUNDLE.security!, passkey: { enabled: true } },
}

const MAIL_READY: BlogSettingsBundle = {
  ...TEST_BLOG_SETTINGS_BUNDLE,
  mail: {
    mail: {
      ...TEST_BLOG_SETTINGS_BUNDLE.mail!.mail,
      enabled: true,
      host: 'api.zeabur.com',
      apiKey: 'zsend-key',
      sender: 'noreply@example.com',
      transport: 'zeabur',
    },
  },
}

function withBucket(
  base: BlogSettingsBundle,
  bucket: keyof RateLimitSettings,
  maxAttempts: number,
): BlogSettingsBundle {
  return {
    ...base,
    rateLimit: { ...base.rateLimit!, [bucket]: { windowSeconds: 60, maxAttempts } },
  }
}

// ─── Seeds ────────────────────────────────────────────────

let ipCounter = 0
function nextIp(): string {
  ipCounter += 1
  return `10.0.0.${ipCounter}`
}

function ctxFor(
  userId: number | string,
  opts: { role?: 'admin' | 'author' | 'visitor'; sessionId?: string; ip?: string } = {},
) {
  return makeAuthedCtx({
    db,
    userId: String(userId),
    role: opts.role ?? 'admin',
    sessionId: opts.sessionId ?? 'session-1',
    clientAddress: opts.ip ?? nextIp(),
  })
}

async function seedUser(opts: Partial<typeof userTable.$inferInsert> = {}): Promise<number> {
  const rows = await db
    .insert(userTable)
    .values({
      name: opts.name ?? 'Alice',
      email: opts.email ?? `alice-${Math.random().toString(36).slice(2)}@example.com`,
      password: opts.password ?? 'hashed',
      role: opts.role ?? 'admin',
      ...opts,
    })
    .returning({ id: userTable.id })
  return rows[0]!.id
}

async function userRow(id: number): Promise<typeof userTable.$inferSelect> {
  const rows = await db.select().from(userTable).where(eq(userTable.id, id))
  return rows[0]!
}

async function seedSession(sid: string, userId: number): Promise<void> {
  await db.insert(sessionTable).values({
    id: sid,
    userId,
    data: {},
    userAgent: 'vitest',
    ip: '127.0.0.1',
    loginAt: new Date(),
    lastActiveAt: new Date(),
    expiresAt: new Date(Date.now() + 3_600_000),
  })
}

async function sessionRow(sid: string): Promise<typeof sessionTable.$inferSelect | undefined> {
  const rows = await db.select().from(sessionTable).where(eq(sessionTable.id, sid))
  return rows[0]
}

async function seedCredential(
  userId: number,
  opts: { credentialId: string; deviceName?: string | null; backedUp?: boolean; createdAt?: Date },
): Promise<void> {
  await db.insert(passkeyCredential).values({
    userId,
    credentialId: opts.credentialId,
    publicKey: Buffer.from([1, 2, 3]),
    counter: 0,
    transports: [],
    deviceName: opts.deviceName ?? null,
    backedUp: opts.backedUp ?? false,
    createdAt: opts.createdAt ?? new Date(),
  })
}

async function credentialRows(): Promise<(typeof passkeyCredential.$inferSelect)[]> {
  return db.select().from(passkeyCredential)
}

async function seedRegChallenge(challenge: string, userId: number, deviceName: string | null = null): Promise<void> {
  await db.insert(oneTimeToken).values({
    key: `passkey:reg-challenge:${challenge}`,
    payload: { userId: String(userId), deviceName },
    expiresAt: new Date(Date.now() + 300_000),
  })
}

async function auditRowsFor(action: string): Promise<(typeof auditLog.$inferSelect)[]> {
  await flushAuditLog()
  return db.select().from(auditLog).where(eq(auditLog.action, action))
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
  // ─── updateProfile ─────────────────────────────────────
  describe('updateProfile', () => {
    it('returns the safe user projection on success and persists the patch', async () => {
      const id = await seedUser({ name: 'Before', receiveEmail: false })

      const res = await call(
        accountRouter.updateProfile,
        { name: 'Alice', receiveEmail: true },
        { context: ctxFor(id, { role: 'admin' }) },
      )

      expect(res.user.id).toBe(String(id))
      expect(res.user.role).toBe('admin')
      const row = await userRow(id)
      expect(row.name).toBe('Alice')
      expect(row.receiveEmail).toBe(true)
    })
  })

  // ─── updatePassword ────────────────────────────────────
  describe('updatePassword', () => {
    it('changes the password, keeps the current session, and records an audit event', async () => {
      const id = await seedUser({ password: await bcrypt.hash('OldPass1234', 4) })
      await seedSession('session-1', id)
      await seedSession('session-2', id)
      const ip = nextIp()

      const res = await call(
        accountRouter.updatePassword,
        { oldPassword: 'OldPass1234', newPassword: 'NewPassword1' },
        { context: ctxFor(id, { sessionId: 'session-1', ip }) },
      )

      expect(res.success).toBe(true)
      expect(await bcrypt.compare('NewPassword1', (await userRow(id)).password)).toBe(true)
      // Other sessions are revoked; the caller's own survives.
      expect(await sessionRow('session-2')).toBeUndefined()
      expect(await sessionRow('session-1')).toBeDefined()
      expect(await auditRowsFor('password_changed')).toHaveLength(1)
    })

    it('rejects with TOO_MANY_REQUESTS when the rate limit is exceeded', async () => {
      setBlogSettingsBundleForTests(withBucket(TEST_BLOG_SETTINGS_BUNDLE, 'signInIp', 1))
      const id = await seedUser({ password: await bcrypt.hash('OldPass1234', 4) })
      const ip = nextIp()

      // First attempt consumes the single-slot budget and succeeds.
      await call(
        accountRouter.updatePassword,
        { oldPassword: 'OldPass1234', newPassword: 'NewPassword1' },
        { context: ctxFor(id, { ip }) },
      )
      await expect(
        call(
          accountRouter.updatePassword,
          { oldPassword: 'NewPassword1', newPassword: 'AnotherPass1' },
          { context: ctxFor(id, { ip }) },
        ),
      ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' })

      // The rejected attempt never reached the password change.
      expect(await bcrypt.compare('NewPassword1', (await userRow(id)).password)).toBe(true)
    })

    it('rejects a weak new password with a validation error', async () => {
      const id = await seedUser()
      await expect(
        call(accountRouter.updatePassword, { oldPassword: 'x', newPassword: 'weak' }, { context: ctxFor(id) }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    })
  })

  // ─── revokeSession ─────────────────────────────────────
  describe('revokeSession', () => {
    it('returns success without an audit event when the target session meta is missing', async () => {
      const id = await seedUser()

      const res = await call(
        accountRouter.revokeSession,
        { id: 'sess-other' },
        { context: ctxFor(id, { sessionId: 'session-current' }) },
      )

      expect(res).toEqual({ success: true, currentSession: false })
      expect(await auditRowsFor('session_revoked')).toHaveLength(0)
    })

    it('reports currentSession=true when id matches, revokes the row, and audits', async () => {
      const id = await seedUser()
      await seedSession('session-1', id)

      const res = await call(
        accountRouter.revokeSession,
        { id: 'session-1' },
        { context: ctxFor(id, { sessionId: 'session-1' }) },
      )

      expect(res).toEqual({ success: true, currentSession: true })
      expect(await sessionRow('session-1')).toBeUndefined()
      const audits = await auditRowsFor('session_revoked')
      expect(audits).toHaveLength(1)
      expect(audits[0]!.resourceId).toBe('session-1')
    })

    it('propagates FORBIDDEN when the target session belongs to a different user', async () => {
      const owner = await seedUser({ name: 'Owner' })
      const stranger = await seedUser({ name: 'Stranger' })
      await seedSession('sess-stranger', stranger)

      await expect(
        call(accountRouter.revokeSession, { id: 'sess-stranger' }, { context: ctxFor(owner) }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })

      expect(await sessionRow('sess-stranger')).toBeDefined()
      expect(await auditRowsFor('session_revoked')).toHaveLength(0)
    })
  })

  // ─── passkey list ──────────────────────────────────────
  describe('passkeyList', () => {
    it('throws BAD_REQUEST when passkeys are disabled', async () => {
      const id = await seedUser()
      await expect(call(accountRouter.passkeyList, undefined, { context: ctxFor(id) })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      })
    })

    it('returns the credential projection with ISO timestamps', async () => {
      setBlogSettingsBundleForTests(PASSKEY_ON)
      const id = await seedUser()
      const ts1 = new Date('2024-01-01T00:00:00Z')
      const ts2 = new Date('2024-01-02T00:00:00Z')
      await seedCredential(id, { credentialId: 'c1', deviceName: 'Phone', backedUp: true, createdAt: ts1 })
      await seedCredential(id, { credentialId: 'c2', deviceName: null, backedUp: false, createdAt: ts2 })

      const res = await call(accountRouter.passkeyList, undefined, { context: ctxFor(id) })

      expect(res.credentials).toHaveLength(2)
      expect(res.credentials[0]).toEqual({
        id: 'c1',
        deviceName: 'Phone',
        createdAt: ts1.toISOString(),
        backedUp: true,
      })
      expect(res.credentials[1]!.backedUp).toBe(false)
    })
  })

  // ─── passkey register begin ────────────────────────────
  describe('passkeyRegisterBegin', () => {
    it('throws BAD_REQUEST when passkeys are disabled', async () => {
      const id = await seedUser()
      await expect(call(accountRouter.passkeyRegisterBegin, {}, { context: ctxFor(id) })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      })
    })

    it('throws TOO_MANY_REQUESTS when rate-limited', async () => {
      setBlogSettingsBundleForTests(withBucket(PASSKEY_ON, 'passkeyRegisterBeginIp', 1))
      const id = await seedUser()
      const ip = nextIp()
      swaMocks.generateRegistrationOptions.mockResolvedValue({ challenge: 'reg-rl' })

      await call(accountRouter.passkeyRegisterBegin, {}, { context: ctxFor(id, { ip }) })
      await expect(call(accountRouter.passkeyRegisterBegin, {}, { context: ctxFor(id, { ip }) })).rejects.toMatchObject(
        { code: 'TOO_MANY_REQUESTS' },
      )
    })

    it('throws NOT_FOUND when the viewer user cannot be loaded', async () => {
      setBlogSettingsBundleForTests(PASSKEY_ON)
      await expect(call(accountRouter.passkeyRegisterBegin, {}, { context: ctxFor(999) })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('forwards the SafeUser to the ceremony and stores the challenge row', async () => {
      setBlogSettingsBundleForTests(PASSKEY_ON)
      const id = await seedUser({ email: 'yubi@example.com' })
      swaMocks.generateRegistrationOptions.mockResolvedValue({ challenge: 'reg-challenge-1' })

      const res = await call(accountRouter.passkeyRegisterBegin, { deviceName: 'YubiKey' }, { context: ctxFor(id) })

      expect(res.options).toEqual({ challenge: 'reg-challenge-1' })
      expect(swaMocks.generateRegistrationOptions).toHaveBeenCalledWith(
        expect.objectContaining({ userName: 'yubi@example.com' }),
      )
      const tokens = await db
        .select()
        .from(oneTimeToken)
        .where(eq(oneTimeToken.key, 'passkey:reg-challenge:reg-challenge-1'))
      expect(tokens).toHaveLength(1)
      expect(tokens[0]!.payload).toEqual({ userId: String(id), deviceName: 'YubiKey' })
    })
  })

  // ─── passkey register finish ───────────────────────────
  describe('passkeyRegisterFinish', () => {
    const validFinish = {
      response: regResponse(),
      deviceName: 'Phone',
      challenge: 'stored-challenge',
    }

    it('throws BAD_REQUEST when passkeys are disabled', async () => {
      const id = await seedUser()
      await expect(
        call(accountRouter.passkeyRegisterFinish, validFinish, { context: ctxFor(id) }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    })

    it('throws TOO_MANY_REQUESTS when rate-limited', async () => {
      setBlogSettingsBundleForTests(withBucket(PASSKEY_ON, 'passkeyRegisterFinishIp', 1))
      const id = await seedUser()
      const ip = nextIp()

      // The first attempt burns the budget and fails on the missing
      // challenge; the second never gets past the limiter.
      await expect(
        call(accountRouter.passkeyRegisterFinish, validFinish, { context: ctxFor(id, { ip }) }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      await expect(
        call(accountRouter.passkeyRegisterFinish, validFinish, { context: ctxFor(id, { ip }) }),
      ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' })
    })

    it('throws NOT_FOUND when the viewer user is missing', async () => {
      setBlogSettingsBundleForTests(PASSKEY_ON)
      await expect(
        call(accountRouter.passkeyRegisterFinish, validFinish, { context: ctxFor(999) }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })

    it('throws BAD_REQUEST when the response shape is invalid', async () => {
      setBlogSettingsBundleForTests(PASSKEY_ON)
      const id = await seedUser()

      await expect(
        call(
          accountRouter.passkeyRegisterFinish,
          { response: { not: 'a registration' }, challenge: 'c' },
          { context: ctxFor(id) },
        ),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

      expect(swaMocks.verifyRegistrationResponse).not.toHaveBeenCalled()
      expect(await credentialRows()).toHaveLength(0)
    })

    it('persists the credential, consumes the challenge, and records an audit event', async () => {
      setBlogSettingsBundleForTests(PASSKEY_ON)
      const id = await seedUser()
      await seedRegChallenge('stored-challenge', id)
      swaMocks.verifyRegistrationResponse.mockResolvedValue({
        verified: true,
        registrationInfo: {
          credential: { id: 'cred-1', publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ['internal'] },
          credentialBackedUp: true,
        },
      })

      const res = await call(accountRouter.passkeyRegisterFinish, validFinish, { context: ctxFor(id) })

      expect(res.success).toBe(true)
      const creds = await credentialRows()
      expect(creds).toHaveLength(1)
      expect(creds[0]!.credentialId).toBe('cred-1')
      expect(creds[0]!.deviceName).toBe('Phone')
      expect(creds[0]!.backedUp).toBe(true)
      // The one-shot challenge is gone — no replay.
      expect(await db.select().from(oneTimeToken)).toHaveLength(0)
      expect(await auditRowsFor('passkey_registered')).toHaveLength(1)
    })
  })

  // ─── passkey delete ────────────────────────────────────
  describe('passkeyDelete', () => {
    it('throws NOT_FOUND when the credential does not exist', async () => {
      setBlogSettingsBundleForTests(PASSKEY_ON)
      const id = await seedUser()

      await expect(
        call(accountRouter.passkeyDelete, { credentialId: 'nope' }, { context: ctxFor(id) }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })

      expect(await auditRowsFor('passkey_deleted')).toHaveLength(0)
    })

    it('deletes the credential and records an audit event', async () => {
      setBlogSettingsBundleForTests(PASSKEY_ON)
      const id = await seedUser()
      await seedCredential(id, { credentialId: 'c1' })

      const res = await call(accountRouter.passkeyDelete, { credentialId: 'c1' }, { context: ctxFor(id) })

      expect(res.success).toBe(true)
      expect(await credentialRows()).toHaveLength(0)
      expect(await auditRowsFor('passkey_deleted')).toHaveLength(1)
    })

    it('throws BAD_REQUEST when passkeys are disabled', async () => {
      const id = await seedUser()
      await seedCredential(id, { credentialId: 'c1' })

      await expect(
        call(accountRouter.passkeyDelete, { credentialId: 'c1' }, { context: ctxFor(id) }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

      expect(await credentialRows()).toHaveLength(1)
    })
  })

  // ─── set login method ──────────────────────────────────
  describe('setLoginMethod', () => {
    it('rejects choosing passkey with no credentials', async () => {
      setBlogSettingsBundleForTests(PASSKEY_ON)
      const id = await seedUser()

      await expect(
        call(accountRouter.setLoginMethod, { method: 'passkey' }, { context: ctxFor(id) }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

      expect((await userRow(id)).loginMethod).toBe('password')
      expect(await auditRowsFor('login_method_changed')).toHaveLength(0)
    })

    it('switches to passkey when a credential exists and records an audit event', async () => {
      setBlogSettingsBundleForTests(PASSKEY_ON)
      const id = await seedUser()
      await seedCredential(id, { credentialId: 'c1' })

      const res = await call(accountRouter.setLoginMethod, { method: 'passkey' }, { context: ctxFor(id) })

      expect(res.success).toBe(true)
      expect((await userRow(id)).loginMethod).toBe('passkey')
      const audits = await auditRowsFor('login_method_changed')
      expect(audits).toHaveLength(1)
      expect(audits[0]!.details).toMatchObject({ method: 'passkey' })
    })

    it('switches back to password', async () => {
      const id = await seedUser({ loginMethod: 'magic-link' })

      const res = await call(accountRouter.setLoginMethod, { method: 'password' }, { context: ctxFor(id) })

      expect(res.success).toBe(true)
      expect((await userRow(id)).loginMethod).toBe('password')
    })

    it('throws BAD_REQUEST when choosing passkey while passkeys are disabled', async () => {
      const id = await seedUser()
      await seedCredential(id, { credentialId: 'c1' })

      await expect(
        call(accountRouter.setLoginMethod, { method: 'passkey' }, { context: ctxFor(id) }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

      expect((await userRow(id)).loginMethod).toBe('password')
    })

    it('throws BAD_REQUEST when choosing magic-link while mail is not configured', async () => {
      const id = await seedUser()

      await expect(
        call(accountRouter.setLoginMethod, { method: 'magic-link' }, { context: ctxFor(id) }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

      expect((await userRow(id)).loginMethod).toBe('password')
    })

    it('switches to magic-link when mail is ready', async () => {
      setBlogSettingsBundleForTests(MAIL_READY)
      const id = await seedUser()

      const res = await call(accountRouter.setLoginMethod, { method: 'magic-link' }, { context: ctxFor(id) })

      expect(res.success).toBe(true)
      expect((await userRow(id)).loginMethod).toBe('magic-link')
      const audits = await auditRowsFor('login_method_changed')
      expect(audits).toHaveLength(1)
      expect(audits[0]!.details).toMatchObject({ method: 'magic-link' })
    })

    it('throws TOO_MANY_REQUESTS when rate-limited', async () => {
      setBlogSettingsBundleForTests(withBucket(TEST_BLOG_SETTINGS_BUNDLE, 'passkeySetForceIp', 1))
      const id = await seedUser()
      const ip = nextIp()

      await call(accountRouter.setLoginMethod, { method: 'password' }, { context: ctxFor(id, { ip }) })
      await expect(
        call(accountRouter.setLoginMethod, { method: 'password' }, { context: ctxFor(id, { ip }) }),
      ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' })
    })
  })
})
