import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import { flushWorkerRedis } from '#/_helpers/redis'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { passkeyCredential } from '@/server/infra/db/schema/passkey'
import { user } from '@/server/infra/db/schema/user'

const poolDb = createDbPool()
const db: NodePgDatabase = poolDb.db
const pool: Pool = poolDb.pool

afterAll(async () => {
  await closePool(pool)
})

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

vi.mock('@/shared/config/getters', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/config/getters')>()
  return {
    ...actual,
    requireBlogSettingsBundle: vi.fn(() => ({
      siteIdentity: { title: 'Test', website: 'https://example.com' },
    })),
  }
})

const passkeyService = await import('@/server/domains/auth/passkey-service')

async function seedUser(overrides: Record<string, unknown> = {}): Promise<bigint> {
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
  await flushWorkerRedis()
  vi.clearAllMocks()
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

describe('passkey — authentication round-trip', () => {
  it('begins authentication and returns options', async () => {
    swaMocks.generateAuthenticationOptions.mockResolvedValue({
      challenge: 'auth-challenge-1',
      rpId: 'example.com',
    })

    const result = await passkeyService.generateAuthenticationOptions(db)

    expect(result.options.challenge).toBe('auth-challenge-1')
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

describe('passkey — force blocks password login', () => {
  it('blocks credential login when passkeyForce is true', async () => {
    await seedUser({ email: 'forced@example.com', passkeyForce: true })

    const { handleCredentialLogin } = await import('@/server/domains/auth/otp-flow')
    const formData = new FormData()
    formData.set('email', 'forced@example.com')
    formData.set('password', 'Password123!')

    const result = await handleCredentialLogin(
      db,
      { id: 'sess-1', get: () => undefined, set: () => undefined, unset: () => undefined } as any,
      '127.0.0.1',
      new Request('http://localhost'),
      formData,
      '/admin',
    )

    expect(result.type).toBe('error')
    if (result.type === 'error') {
      expect(result.message).toContain('Passkey')
    }
  })
})

describe('passkey — password reset clears passkeys', () => {
  it('deletes all credentials and disables passkeyForce on password reset', async () => {
    const userId = await seedUser({ passkeyForce: true })

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
    await db.update(user).set({ passkeyForce: false }).where(eq(user.id, userId))
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
    expect(dbUser.passkeyForce).toBe(false)
  })
})
