import type { SigninFlowContext } from '@kobato/server/domains/auth/services/shared'
import type { BlogSession } from '@kobato/server/domains/auth/session-storage'
import type { BlogSettingsBundle } from '@kobato/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeSession } from '#/_helpers/session'

import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@kobato/server/domains/audit/services/batcher'
import { generateAuthenticationOptions } from '@kobato/server/domains/auth/passkey/service'
import { signInWithPasskey } from '@kobato/server/domains/auth/passkey/signin'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry'
import { auditLog } from '@kobato/server/infra/db/schema/config'
import { passkeyCredential } from '@kobato/server/infra/db/schema/passkey'
import { session as sessionTable } from '@kobato/server/infra/db/schema/session'
import { user as userTable } from '@kobato/server/infra/db/schema/user'
import { __resetRateLimitsForTests } from '@kobato/server/infra/rate-limit'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// signInWithPasskey against the real engine: the passkey gate reads the
// real settings bundle, the WebAuthn service consumes a real challenge
// row and a real credential row, the session primitive mints a real
// session-table row + last-login touch + login audit, and the rate
// limiter is the real in-process one. The ONLY mock is
// `@simplewebauthn/server` — the attestation crypto is a true external
// that cannot produce a genuine ceremony in tests.

const swaMocks = vi.hoisted(() => ({
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}))

vi.mock('@simplewebauthn/server', () => ({
  generateAuthenticationOptions: vi.fn((...args: unknown[]) => swaMocks.generateAuthenticationOptions(...args)),
  verifyAuthenticationResponse: vi.fn((...args: unknown[]) => swaMocks.verifyAuthenticationResponse(...args)),
}))

const db = getTestDb()
const CLIENT = '203.0.113.7'

const PASSKEY_ON = {
  ...TEST_BLOG_SETTINGS_BUNDLE,
  security: { ...TEST_BLOG_SETTINGS_BUNDLE.security!, passkey: { enabled: true } },
} as BlogSettingsBundle

function passkeyFinishBucket(maxAttempts: number): BlogSettingsBundle {
  return {
    ...PASSKEY_ON,
    rateLimit: {
      ...PASSKEY_ON.rateLimit!,
      passkeyAuthFinishIp: { windowSeconds: 60, maxAttempts },
    },
  } as BlogSettingsBundle
}

async function seedUser(overrides: Record<string, unknown> = {}): Promise<number> {
  const hashed = await bcrypt.hash('Password123!', 12)
  const [inserted] = await db
    .insert(userTable)
    .values({
      name: 'Admin',
      email: `admin-${crypto.randomUUID()}@example.com`,
      password: hashed,
      role: 'admin',
      ...overrides,
    })
    .returning({ id: userTable.id })
  return inserted!.id
}

async function seedCredential(userId: number, credentialId: string): Promise<void> {
  await db.insert(passkeyCredential).values({
    userId,
    credentialId,
    publicKey: Buffer.from([1, 2, 3]),
    counter: 0,
    transports: ['internal'],
  })
}

/** Begin a real authentication ceremony — the challenge row lands in `one_time_token`. */
async function beginAuthentication(challenge: string, email?: string): Promise<void> {
  swaMocks.generateAuthenticationOptions.mockResolvedValueOnce({ challenge, rpId: 'example.com' })
  await generateAuthenticationOptions(db, email)
}

function ctx(session: BlogSession): SigninFlowContext {
  return { db, session, clientAddress: CLIENT, markSessionDirty: () => {} }
}

function request(): Request {
  return new Request('http://localhost/admin/signin?action=passkey', {
    method: 'POST',
    headers: { 'User-Agent': 'vitest' },
  })
}

function passkeyForm(credentialId = 'cred-1', challenge = 'challenge-1'): FormData {
  const fd = new FormData()
  fd.set('passkey_response', JSON.stringify({ id: credentialId }))
  fd.set('passkey_challenge', challenge)
  return fd
}

beforeEach(async () => {
  await clearAllTables(db)
  initAllBatchers(getDatabaseHandle())
  __resetRateLimitsForTests()
  vi.clearAllMocks()
  setBlogSettingsBundleForTests(PASSKEY_ON)
})

afterEach(async () => {
  // Flush BEFORE dropping the batcher: InsertBatcher.dispose() leaves an
  // armed flush timer behind, so an unflushed queue would otherwise
  // insert this case's stale events mid-next-test.
  await flushAuditLog()
  resetAllBatchers()
})

describe('auth/passkey/signin — signInWithPasskey (real engine)', () => {
  it('refuses when the passkey feature is disabled', async () => {
    setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)

    const result = await signInWithPasskey(ctx(makeSession({})), request(), passkeyForm(), '/admin')

    expect(result).toEqual({ type: 'error', message: 'Passkey 登录未启用。' })
    expect(swaMocks.verifyAuthenticationResponse).not.toHaveBeenCalled()
    expect(await db.select().from(sessionTable)).toHaveLength(0)
  })

  it('refuses when the response or challenge field is missing', async () => {
    const result = await signInWithPasskey(ctx(makeSession({})), request(), new FormData(), '/admin')

    expect(result).toEqual({ type: 'error', message: 'Passkey 响应缺失。' })
  })

  it('refuses a malformed JSON response', async () => {
    const fd = new FormData()
    fd.set('passkey_response', '{not-json')
    fd.set('passkey_challenge', 'challenge-1')

    const result = await signInWithPasskey(ctx(makeSession({})), request(), fd, '/admin')

    expect(result).toEqual({ type: 'error', message: 'Passkey 响应格式错误。' })
    expect(swaMocks.verifyAuthenticationResponse).not.toHaveBeenCalled()
  })

  it('refuses when the finish rate limit trips', async () => {
    setBlogSettingsBundleForTests(passkeyFinishBucket(1))

    // First reach of the flow consumes the single-slot budget (the
    // verification itself fails on the unknown credential — the limiter
    // bumps before the ceremony runs).
    const first = await signInWithPasskey(ctx(makeSession({})), request(), passkeyForm('nope'), '/admin')
    expect(first.type).toBe('error')

    const result = await signInWithPasskey(ctx(makeSession({})), request(), passkeyForm('nope'), '/admin')

    expect(result).toEqual({ type: 'error', message: '操作过于频繁，请稍后再试。' })
  })

  it('on success: establishes a real passkey session, touches last-login, audits once, redirects', async () => {
    const userId = await seedUser()
    await seedCredential(userId, 'cred-1')
    await beginAuthentication('challenge-1')
    swaMocks.verifyAuthenticationResponse.mockResolvedValueOnce({
      verified: true,
      authenticationInfo: {
        credentialID: 'cred-1',
        newCounter: 1,
        userVerified: true,
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
        origin: 'https://example.com',
        rpID: 'example.com',
      },
    })

    const session = makeSession({})
    const result = await signInWithPasskey(ctx(session), request(), passkeyForm(), '/admin')

    expect(result.type).toBe('redirect')
    if (result.type !== 'redirect') {
      throw new Error('expected redirect')
    }
    expect(result.to).toBe('/admin')
    expect(result.setCookie).toMatch(/^__session=/)

    // The session primitive minted exactly one real session row, owned
    // by the user, with the login meta stamped.
    const sessions = await db.select().from(sessionTable)
    expect(sessions).toHaveLength(1)
    expect(sessions[0]!.userId).toBe(userId)
    expect(sessions[0]!.ip).toBe(CLIENT)

    // Last-login touch landed on the real user row.
    const [row] = await db.select().from(userTable).where(eq(userTable.id, userId))
    expect(row!.lastIp).toBe(CLIENT)
    expect(row!.lastUa).toBe('vitest')

    // The credential counter advanced through the real service.
    const [cred] = await db.select().from(passkeyCredential).where(eq(passkeyCredential.credentialId, 'cred-1'))
    expect(cred!.counter).toBe(1)

    // establishLoginSession owns the entire login side-effect surface —
    // exactly ONE login audit, attributed to the new sid, method passkey.
    await flushAuditLog()
    const logins = await db.select().from(auditLog).where(eq(auditLog.action, 'login'))
    expect(logins).toHaveLength(1)
    expect(logins[0]!.actorId).toBe(userId)
    expect(logins[0]!.resourceId).toBe(sessions[0]!.id)
    expect(logins[0]!.details).toMatchObject({ method: 'passkey' })
  })

  it('surfaces the service error message verbatim', async () => {
    const userId = await seedUser()
    await seedCredential(userId, 'cred-1')
    await beginAuthentication('challenge-1')
    swaMocks.verifyAuthenticationResponse.mockResolvedValueOnce({ verified: false })

    const result = await signInWithPasskey(ctx(makeSession({})), request(), passkeyForm(), '/admin')

    expect(result).toEqual({ type: 'error', message: 'Passkey 验证失败。' })
    expect(await db.select().from(sessionTable)).toHaveLength(0)
  })

  it('falls back to the generic error for non-Error throws', async () => {
    const userId = await seedUser()
    await seedCredential(userId, 'cred-1')
    await beginAuthentication('challenge-1')
    // The service does not wrap upstream failures — a non-Error
    // rejection from the WebAuthn library propagates raw.
    swaMocks.verifyAuthenticationResponse.mockRejectedValueOnce('boom')

    const result = await signInWithPasskey(ctx(makeSession({})), request(), passkeyForm(), '/admin')

    expect(result).toEqual({ type: 'error', message: 'Passkey 验证失败，请重试。' })
  })
})
