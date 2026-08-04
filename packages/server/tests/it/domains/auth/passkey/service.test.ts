import type { SafeUser } from '@kobato/server/infra/db/operations/user'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'

import { oneTimeToken } from '@kobato/server/infra/db/schema/one-time-token'
import { passkeyCredential } from '@kobato/server/infra/db/schema/passkey'
import { user } from '@kobato/server/infra/db/schema/user'
import { DomainError } from '@kobato/server/infra/http/errors'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = getTestDb()

// ── Mock @simplewebauthn/server ─────────────────────────────────────────────

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

// The passkey service reads rpName/rpID/origin and the passkey gate off
// the real settings snapshot — seed it through the test bundle.
function bundleWithWebsite(website: string) {
  return {
    ...TEST_BLOG_SETTINGS_BUNDLE,
    siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, title: 'Test', website },
    security: {
      ...TEST_BLOG_SETTINGS_BUNDLE.security!,
      passkey: { ...TEST_BLOG_SETTINGS_BUNDLE.security!.passkey, enabled: true },
    },
  }
}

const passkeyService = await import('@kobato/server/domains/auth/passkey/service')

async function seedUser(overrides: Record<string, unknown> = {}): Promise<number> {
  const hashed = await bcrypt.hash('Password123!', 12)
  const [inserted] = await db
    .insert(user)
    .values({
      name: 'Test User',
      email: 'test@example.com',
      password: hashed,
      role: 'admin',
      ...overrides,
    })
    .returning({ id: user.id })
  return inserted!.id
}

beforeEach(async () => {
  await clearAllTables(db)
  vi.clearAllMocks()
  setBlogSettingsBundleForTests(bundleWithWebsite('https://example.com'))
})

describe('passkey — registration round-trip', () => {
  it('begins registration and stores a challenge', async () => {
    const userId = await seedUser()
    const dbUser = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
      .then((r) => r[0])

    swaMocks.generateRegistrationOptions.mockResolvedValue({
      challenge: 'reg-challenge-1',
      rp: { name: 'Test', id: 'example.com' },
    })

    const result = await passkeyService.generateRegistrationOptions(db, dbUser)

    expect(result.options.challenge).toBe('reg-challenge-1')

    // The challenge lands in `one_time_token` as plain JSON with a 300s TTL.
    const tokens = await db
      .select()
      .from(oneTimeToken)
      .where(eq(oneTimeToken.key, 'passkey:reg-challenge:reg-challenge-1'))
    expect(tokens).toHaveLength(1)
    expect(tokens[0]!.payload).toEqual({ userId: String(userId), deviceName: null })
    expect(tokens[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 290_000)
    expect(tokens[0]!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 300_000)
  })

  it('passes excludeCredentials with the stored transports', async () => {
    const userId = await seedUser({ email: 'exclude@example.com' })
    const dbUser = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
      .then((r) => r[0])
    await db.insert(passkeyCredential).values({
      userId,
      credentialId: 'cred-existing',
      publicKey: Buffer.from([9, 9, 9]),
      counter: 0,
      transports: ['internal'],
    })

    swaMocks.generateRegistrationOptions.mockResolvedValue({
      challenge: 'reg-challenge-exclude',
      rp: { name: 'Test', id: 'example.com' },
    })

    await passkeyService.generateRegistrationOptions(db, dbUser)

    expect(swaMocks.generateRegistrationOptions).toHaveBeenCalledOnce()
    const callArg = swaMocks.generateRegistrationOptions.mock.calls[0]![0]
    expect(callArg.excludeCredentials).toEqual([{ id: 'cred-existing', transports: ['internal'] }])
  })

  it('finishes registration and persists the credential', async () => {
    const userId = await seedUser()
    const dbUser = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
      .then((r) => r[0])

    swaMocks.generateRegistrationOptions.mockResolvedValue({
      challenge: 'reg-challenge-2',
      rp: { name: 'Test', id: 'example.com' },
    })

    await passkeyService.generateRegistrationOptions(db, dbUser, 'My Phone')

    swaMocks.verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: 'cred-abc',
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
          transports: ['internal'],
        },
        credentialBackedUp: false,
      },
    })

    const result = await passkeyService.verifyRegistrationResponse(db, dbUser, {
      response: {
        id: 'cred-abc',
        rawId: 'raw',
        response: { clientDataJSON: '', attestationObject: '' },
        clientExtensionResults: {},
        type: 'public-key',
      },
      challenge: 'reg-challenge-2',
      deviceName: 'My Phone',
    })

    expect(result.credentialId).toBe('cred-abc')
    expect(result.deviceName).toBe('My Phone')

    const creds = await db.select().from(passkeyCredential).where(eq(passkeyCredential.userId, userId))
    expect(creds).toHaveLength(1)
    expect(creds[0].credentialId).toBe('cred-abc')
  })
})

describe('passkey — registration failure branches', () => {
  function registrationResponse(id = 'cred-x') {
    return {
      response: {
        id,
        rawId: 'raw',
        response: { clientDataJSON: '', attestationObject: '' },
        clientExtensionResults: {},
        type: 'public-key' as const,
      },
    }
  }

  async function beginRegistration(dbUser: SafeUser, challenge: string) {
    swaMocks.generateRegistrationOptions.mockResolvedValue({
      challenge,
      rp: { name: 'Test', id: 'example.com' },
    })
    await passkeyService.generateRegistrationOptions(db, dbUser)
  }

  it('rejects an expired challenge', async () => {
    const userId = await seedUser({ email: 'reg-expired@example.com' })
    const dbUser = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
      .then((r) => r[0])
    await beginRegistration(dbUser, 'reg-expired')

    // Age the stored challenge past its TTL — the atomic consume treats
    // expired rows as misses.
    await db
      .update(oneTimeToken)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(oneTimeToken.key, 'passkey:reg-challenge:reg-expired'))

    await expect(
      passkeyService.verifyRegistrationResponse(db, dbUser, {
        ...registrationResponse(),
        challenge: 'reg-expired',
      }),
    ).rejects.toThrow(new DomainError('BAD_REQUEST', '注册挑战已过期或无效，请重试。'))
  })

  it('rejects a challenge that belongs to a different user', async () => {
    const ownerId = await seedUser({ email: 'reg-owner@example.com' })
    const otherId = await seedUser({ email: 'reg-other@example.com' })
    const owner = await db
      .select()
      .from(user)
      .where(eq(user.id, ownerId))
      .limit(1)
      .then((r) => r[0])
    const other = await db
      .select()
      .from(user)
      .where(eq(user.id, otherId))
      .limit(1)
      .then((r) => r[0])
    await beginRegistration(owner, 'reg-wrong-user')

    await expect(
      passkeyService.verifyRegistrationResponse(db, other, {
        ...registrationResponse(),
        challenge: 'reg-wrong-user',
      }),
    ).rejects.toThrow(new DomainError('BAD_REQUEST', '注册挑战与当前用户不匹配。'))
  })

  it('maps a duplicate credential to a CONFLICT DomainError (real unique constraint)', async () => {
    const userId = await seedUser({ email: 'reg-dup@example.com' })
    const dbUser = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
      .then((r) => r[0])

    swaMocks.verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: 'cred-dup',
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
          transports: ['internal'],
        },
        credentialBackedUp: false,
      },
    })

    // First registration succeeds against the real table.
    await beginRegistration(dbUser, 'reg-dup-1')
    await passkeyService.verifyRegistrationResponse(db, dbUser, {
      ...registrationResponse('cred-dup'),
      challenge: 'reg-dup-1',
    })

    // Second registration of the same credential id hits the real UNIQUE
    // constraint on passkey_credential.credential_id.
    await beginRegistration(dbUser, 'reg-dup-2')
    await expect(
      passkeyService.verifyRegistrationResponse(db, dbUser, {
        ...registrationResponse('cred-dup'),
        challenge: 'reg-dup-2',
      }),
    ).rejects.toThrow(new DomainError('CONFLICT', '该 Passkey 凭据已注册。'))

    const creds = await db.select().from(passkeyCredential).where(eq(passkeyCredential.userId, userId))
    expect(creds).toHaveLength(1)
  })

  it('rejects when SWA verification returns verified: false', async () => {
    const userId = await seedUser({ email: 'reg-unverified@example.com' })
    const dbUser = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
      .then((r) => r[0])
    await beginRegistration(dbUser, 'reg-unverified')
    swaMocks.verifyRegistrationResponse.mockResolvedValue({ verified: false })

    await expect(
      passkeyService.verifyRegistrationResponse(db, dbUser, {
        ...registrationResponse(),
        challenge: 'reg-unverified',
      }),
    ).rejects.toThrow(new DomainError('BAD_REQUEST', 'Passkey 注册验证失败。'))

    const creds = await db.select().from(passkeyCredential).where(eq(passkeyCredential.userId, userId))
    expect(creds).toHaveLength(0)
  })
})

describe('passkey — authentication round-trip', () => {
  it('begins authentication and returns options', async () => {
    swaMocks.generateAuthenticationOptions.mockResolvedValue({
      challenge: 'auth-challenge-1',
      rpId: 'example.com',
    })

    const result = await passkeyService.generateAuthenticationOptions(db)

    expect(result.options.challenge).toBe('auth-challenge-1')

    // No email → no allowCredentials, and the challenge payload records it.
    const callArg = swaMocks.generateAuthenticationOptions.mock.calls[0]![0]
    expect(callArg.allowCredentials).toBeUndefined()
    const tokens = await db
      .select()
      .from(oneTimeToken)
      .where(eq(oneTimeToken.key, 'passkey:auth-challenge:auth-challenge-1'))
    expect(tokens).toHaveLength(1)
    expect(tokens[0]!.payload).toEqual({ email: null })
  })

  it('passes allowCredentials for a known email', async () => {
    const userId = await seedUser({ email: 'known@example.com' })
    await db.insert(passkeyCredential).values({
      userId,
      credentialId: 'cred-known',
      publicKey: Buffer.from([1, 2, 3]),
      counter: 0,
      transports: ['internal'],
    })

    swaMocks.generateAuthenticationOptions.mockResolvedValue({
      challenge: 'auth-challenge-known',
      rpId: 'example.com',
    })

    const result = await passkeyService.generateAuthenticationOptions(db, 'known@example.com')

    expect(result.options.challenge).toBe('auth-challenge-known')
    const callArg = swaMocks.generateAuthenticationOptions.mock.calls[0]![0]
    expect(callArg.allowCredentials).toEqual([{ id: 'cred-known', transports: ['internal'] }])
    const tokens = await db
      .select()
      .from(oneTimeToken)
      .where(eq(oneTimeToken.key, 'passkey:auth-challenge:auth-challenge-known'))
    expect(tokens[0]!.payload).toEqual({ email: 'known@example.com' })
  })

  it('authenticates with a registered credential', async () => {
    const userId = await seedUser({ email: 'auth@example.com' })

    // Register a credential first
    swaMocks.generateRegistrationOptions.mockResolvedValue({
      challenge: 'reg-challenge-auth',
      rp: { name: 'Test', id: 'example.com' },
    })
    const dbUser = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
      .then((r) => r[0])
    await passkeyService.generateRegistrationOptions(db, dbUser)

    swaMocks.verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: 'cred-auth',
          publicKey: new Uint8Array([4, 5, 6]),
          counter: 0,
          transports: ['internal'],
        },
        credentialBackedUp: false,
      },
    })
    await passkeyService.verifyRegistrationResponse(db, dbUser, {
      response: {
        id: 'cred-auth',
        rawId: 'raw',
        response: { clientDataJSON: '', attestationObject: '' },
        clientExtensionResults: {},
        type: 'public-key',
      },
      challenge: 'reg-challenge-auth',
    })

    // Now authenticate
    swaMocks.generateAuthenticationOptions.mockResolvedValue({
      challenge: 'auth-challenge-2',
      rpId: 'example.com',
    })
    await passkeyService.generateAuthenticationOptions(db, 'auth@example.com')

    swaMocks.verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: {
        credentialID: 'cred-auth',
        newCounter: 1,
        userVerified: true,
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
        origin: 'https://example.com',
        rpID: 'example.com',
      },
    })

    const result = await passkeyService.verifyAuthenticationResponse(
      db,
      {
        id: 'cred-auth',
        rawId: 'raw',
        response: { clientDataJSON: '', authenticatorData: '', signature: '' },
        clientExtensionResults: {},
        type: 'public-key',
      },
      'auth-challenge-2',
    )

    expect(result.user.id).toBe(userId)
    expect(result.authMethod).toBe('passkey')
    // The returned user is the SafeUser accessor result — no sensitive fields.
    expect(result.user).not.toHaveProperty('password')
    expect(result.user).not.toHaveProperty('lastIp')
    expect(result.user).not.toHaveProperty('lastUa')

    // Counter should be updated
    const cred = await db
      .select()
      .from(passkeyCredential)
      .where(eq(passkeyCredential.credentialId, 'cred-auth'))
      .limit(1)
      .then((r) => r[0])
    expect(cred.counter).toBe(1)
  })
})

describe('passkey — authentication failure branches', () => {
  function authenticationResponse(id: string) {
    return {
      id,
      rawId: 'raw',
      response: { clientDataJSON: '', authenticatorData: '', signature: '' },
      clientExtensionResults: {},
      type: 'public-key' as const,
    }
  }

  async function beginAuthentication(challenge: string, email?: string) {
    swaMocks.generateAuthenticationOptions.mockResolvedValue({ challenge, rpId: 'example.com' })
    await passkeyService.generateAuthenticationOptions(db, email)
  }

  it('rejects an unknown credential id', async () => {
    await beginAuthentication('auth-unknown-cred')

    await expect(
      passkeyService.verifyAuthenticationResponse(db, authenticationResponse('nonexistent'), 'auth-unknown-cred'),
    ).rejects.toThrow(new DomainError('BAD_REQUEST', 'Passkey 凭据不存在。'))
  })

  it('rejects when SWA verification returns verified: false and leaves the counter untouched', async () => {
    const userId = await seedUser({ email: 'auth-unverified@example.com' })
    await db.insert(passkeyCredential).values({
      userId,
      credentialId: 'cred-unverified',
      publicKey: Buffer.from([1, 2, 3]),
      counter: 3,
      transports: ['internal'],
    })
    await beginAuthentication('auth-unverified')
    swaMocks.verifyAuthenticationResponse.mockResolvedValue({ verified: false })

    await expect(
      passkeyService.verifyAuthenticationResponse(db, authenticationResponse('cred-unverified'), 'auth-unverified'),
    ).rejects.toThrow(new DomainError('BAD_REQUEST', 'Passkey 验证失败。'))

    const cred = await db
      .select()
      .from(passkeyCredential)
      .where(eq(passkeyCredential.credentialId, 'cred-unverified'))
      .limit(1)
      .then((r) => r[0])
    expect(cred!.counter).toBe(3)
  })
})

describe('passkey — credential management', () => {
  async function seedCredential(userId: number, credentialId: string, overrides: Record<string, unknown> = {}) {
    await db.insert(passkeyCredential).values({
      userId,
      credentialId,
      publicKey: Buffer.from([1, 2, 3]),
      counter: 0,
      transports: [],
      ...overrides,
    })
  }

  async function loginMethodOf(userId: number): Promise<string | null> {
    const row = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
      .then((r) => r[0])
    return row?.loginMethod ?? null
  }

  it('lists credentials ordered by createdAt', async () => {
    const userId = await seedUser({ email: 'list@example.com' })
    await seedCredential(userId, 'cred-new', { createdAt: new Date('2024-01-02'), deviceName: 'Laptop' })
    await seedCredential(userId, 'cred-old', { createdAt: new Date('2024-01-01'), deviceName: 'Phone' })

    const result = await passkeyService.listCredentials(db, userId)

    expect(result.map((c) => c.id)).toEqual(['cred-old', 'cred-new'])
    expect(result[0]).toMatchObject({ id: 'cred-old', deviceName: 'Phone' })
  })

  it('deleteCredential returns false when nothing matches and leaves the login method untouched', async () => {
    const userId = await seedUser({ email: 'del-nope@example.com', loginMethod: 'passkey' })
    await seedCredential(userId, 'cred-keep')

    const result = await passkeyService.deleteCredential(db, 'nope', userId)

    expect(result).toBe(false)
    expect(await loginMethodOf(userId)).toBe('passkey')
  })

  it('deleteCredential preserves the passkey login method when credentials remain', async () => {
    const userId = await seedUser({ email: 'del-remain@example.com', loginMethod: 'passkey' })
    await seedCredential(userId, 'cred-1')
    await seedCredential(userId, 'cred-2')

    const result = await passkeyService.deleteCredential(db, 'cred-1', userId)

    expect(result).toBe(true)
    expect(await loginMethodOf(userId)).toBe('passkey')
    const creds = await db.select().from(passkeyCredential).where(eq(passkeyCredential.userId, userId))
    expect(creds.map((c) => c.credentialId)).toEqual(['cred-2'])
  })

  it('deleteAllCredentials returns the count and reverts the login method to password', async () => {
    const userId = await seedUser({ email: 'del-all@example.com', loginMethod: 'passkey' })
    await seedCredential(userId, 'cred-1')
    await seedCredential(userId, 'cred-2')

    const count = await passkeyService.deleteAllCredentials(db, userId)

    expect(count).toBe(2)
    expect(await loginMethodOf(userId)).toBe('password')
    expect(await db.select().from(passkeyCredential).where(eq(passkeyCredential.userId, userId))).toHaveLength(0)
  })

  it('setLoginMethod rejects passkey when no credentials exist', async () => {
    const userId = await seedUser({ email: 'method-none@example.com' })

    await expect(passkeyService.setLoginMethod(db, userId, 'passkey')).rejects.toThrow(
      new DomainError('BAD_REQUEST', '必须至少注册一个 Passkey 才能选择 Passkey 登陆。'),
    )
    expect(await loginMethodOf(userId)).toBe('password')
  })

  it('setLoginMethod allows passkey with a credential and switches back to password freely', async () => {
    const userId = await seedUser({ email: 'method-ok@example.com' })
    await seedCredential(userId, 'cred-1')

    await passkeyService.setLoginMethod(db, userId, 'passkey')
    expect(await loginMethodOf(userId)).toBe('passkey')

    await passkeyService.setLoginMethod(db, userId, 'password')
    expect(await loginMethodOf(userId)).toBe('password')
  })
})

describe('passkey — rpConfig validation', () => {
  async function freshUser() {
    const userId = await seedUser({ email: `rp-${crypto.randomUUID()}@example.com` })
    return db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
      .then((r) => r[0]!)
  }

  it.each([
    ['non-HTTPS origin', 'http://example.com'],
    ['private IPv4 192.168.x', 'https://192.168.1.1'],
    ['IPv6 ULA fc00::1', 'https://[fc00::1]'],
  ])('rejects %s', async (_label, website) => {
    setBlogSettingsBundleForTests(bundleWithWebsite(website))
    const dbUser = await freshUser()

    await expect(passkeyService.generateRegistrationOptions(db, dbUser)).rejects.toThrow(
      new DomainError('BAD_REQUEST', 'Passkey 需要公开可访问的 HTTPS 域名，不能使用 localhost 或私有地址。'),
    )
    expect(swaMocks.generateRegistrationOptions).not.toHaveBeenCalled()
  })

  it('allows a valid public HTTPS domain', async () => {
    setBlogSettingsBundleForTests(bundleWithWebsite('https://blog.example.com'))
    const dbUser = await freshUser()
    swaMocks.generateRegistrationOptions.mockResolvedValue({
      challenge: 'rp-ok',
      rp: { name: 'Test', id: 'blog.example.com' },
    })

    const result = await passkeyService.generateRegistrationOptions(db, dbUser)

    expect(result.options.challenge).toBe('rp-ok')
  })
})

describe('passkey — passkey login method blocks password login', () => {
  it('blocks credential login when loginMethod is passkey', async () => {
    await seedUser({ email: 'forced@example.com', loginMethod: 'passkey' })

    const { handleCredentialLogin } = await import('@kobato/server/domains/auth/services/credential')
    const formData = new FormData()
    formData.set('email', 'forced@example.com')
    formData.set('password', 'Password123!')

    const markSessionDirty = vi.fn()
    const result = await handleCredentialLogin(
      {
        db,
        session: { id: 'sess-1', data: {}, get: () => undefined, set: () => undefined, unset: () => undefined } as any,
        clientAddress: '127.0.0.1',
        markSessionDirty,
      },
      new Request('http://localhost'),
      formData,
      '/admin',
    )

    expect(result.type).toBe('error')
    if (result.type === 'error') {
      expect(result.message).toContain('Passkey')
    }
    // loginMethod='passkey' 是「无 mutation 的错误结果」：既不携带 setCookie，也不标脏会话。
    expect(result.setCookie).toBeUndefined()
    expect(markSessionDirty).not.toHaveBeenCalled()
  })
})

describe('passkey — password reset clears passkeys', () => {
  it('deletes all credentials and resets loginMethod on password reset', async () => {
    const userId = await seedUser({ loginMethod: 'passkey' })

    // Insert a credential
    await db.insert(passkeyCredential).values({
      userId,
      credentialId: 'cred-reset',
      publicKey: Buffer.from([1, 2, 3]),
      counter: 0,
      transports: [],
      deviceName: null,
      backedUp: false,
    })

    // Verify credential exists
    let creds = await db.select().from(passkeyCredential).where(eq(passkeyCredential.userId, userId))
    expect(creds).toHaveLength(1)

    // Simulate password reset clearing passkeys
    await db.update(user).set({ loginMethod: 'password' }).where(eq(user.id, userId))
    await passkeyService.deleteAllCredentials(db, userId)

    // Verify cleared
    creds = await db.select().from(passkeyCredential).where(eq(passkeyCredential.userId, userId))
    expect(creds).toHaveLength(0)

    const dbUser = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
      .then((r) => r[0])
    expect(dbUser.loginMethod).toBe('password')
  })
})

describe('passkey — deleting last credential reverts to password login', () => {
  it('reverts loginMethod to password when the user deletes their only credential', async () => {
    const userId = await seedUser({ loginMethod: 'passkey' })

    // Register one credential
    swaMocks.generateRegistrationOptions.mockResolvedValue({
      challenge: 'reg-c-force',
      rp: { name: 'Test', id: 'example.com' },
    })
    const dbUser = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
      .then((r) => r[0])
    await passkeyService.generateRegistrationOptions(db, dbUser)

    swaMocks.verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: 'cred-force',
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
          transports: ['internal'],
        },
        credentialBackedUp: false,
      },
    })
    await passkeyService.verifyRegistrationResponse(db, dbUser, {
      response: {
        id: 'cred-force',
        rawId: 'raw',
        response: { clientDataJSON: '', attestationObject: '' },
        clientExtensionResults: {},
        type: 'public-key',
      },
      challenge: 'reg-c-force',
    })

    // Verify credential exists and the method is still passkey
    let creds = await db.select().from(passkeyCredential).where(eq(passkeyCredential.userId, userId))
    expect(creds).toHaveLength(1)

    let dbUserRow = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
      .then((r) => r[0])
    expect(dbUserRow.loginMethod).toBe('passkey')

    // Delete the only credential — the service owns the invariant and
    // reverts the login method itself.
    const ok = await passkeyService.deleteCredential(db, 'cred-force', userId)
    expect(ok).toBe(true)

    // Verify the method reverted to password
    dbUserRow = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
      .then((r) => r[0])
    expect(dbUserRow.loginMethod).toBe('password')
  })
})

describe('passkey — replay attack prevention', () => {
  it('rejects reuse of a consumed authentication challenge', async () => {
    const userId = await seedUser({ email: 'replay@example.com' })

    // Register a credential
    swaMocks.generateRegistrationOptions.mockResolvedValue({
      challenge: 'replay-reg-c',
      rp: { name: 'Test', id: 'example.com' },
    })
    const dbUser = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
      .then((r) => r[0])
    await passkeyService.generateRegistrationOptions(db, dbUser)

    swaMocks.verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: 'cred-replay',
          publicKey: new Uint8Array([7, 8, 9]),
          counter: 0,
          transports: ['internal'],
        },
        credentialBackedUp: false,
      },
    })
    await passkeyService.verifyRegistrationResponse(db, dbUser, {
      response: {
        id: 'cred-replay',
        rawId: 'raw',
        response: { clientDataJSON: '', attestationObject: '' },
        clientExtensionResults: {},
        type: 'public-key',
      },
      challenge: 'replay-reg-c',
    })

    // Begin authentication
    swaMocks.generateAuthenticationOptions.mockResolvedValue({
      challenge: 'replay-auth-c',
      rpId: 'example.com',
    })
    await passkeyService.generateAuthenticationOptions(db, 'replay@example.com')

    swaMocks.verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: {
        credentialID: 'cred-replay',
        newCounter: 1,
        userVerified: true,
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
        origin: 'https://example.com',
        rpID: 'example.com',
      },
    })

    // First use succeeds
    const firstResult = await passkeyService.verifyAuthenticationResponse(
      db,
      {
        id: 'cred-replay',
        rawId: 'raw',
        response: { clientDataJSON: '', authenticatorData: '', signature: '' },
        clientExtensionResults: {},
        type: 'public-key',
      },
      'replay-auth-c',
    )
    expect(firstResult.authMethod).toBe('passkey')

    // Second use with the same challenge must fail
    await expect(
      passkeyService.verifyAuthenticationResponse(
        db,
        {
          id: 'cred-replay',
          rawId: 'raw',
          response: { clientDataJSON: '', authenticatorData: '', signature: '' },
          clientExtensionResults: {},
          type: 'public-key',
        },
        'replay-auth-c',
      ),
    ).rejects.toThrow()
  })
})
