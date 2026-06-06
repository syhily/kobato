import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SafeUser } from '@/server/infra/db/operations/user'
import type { PasskeyCredentialRow } from '@/server/infra/db/types'

const mockRedis = {
  set: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  eval: vi.fn(),
}

const swaMocks = {
  generateRegistrationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}

vi.mock('@/server/infra/redis/storage', () => ({
  redisInstance: vi.fn(() => mockRedis),
}))

vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn((...args: unknown[]) => swaMocks.generateRegistrationOptions(...args)),
  verifyRegistrationResponse: vi.fn((...args: unknown[]) => swaMocks.verifyRegistrationResponse(...args)),
  generateAuthenticationOptions: vi.fn((...args: unknown[]) => swaMocks.generateAuthenticationOptions(...args)),
  verifyAuthenticationResponse: vi.fn((...args: unknown[]) => swaMocks.verifyAuthenticationResponse(...args)),
}))

vi.mock('@/shared/config/getters', () => ({
  requireBlogSettingsBundle: vi.fn(() => ({
    siteIdentity: { title: 'Test', website: 'https://example.com' },
  })),
}))

vi.mock('@/server/infra/db/operations/user', () => ({
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
}))

const db = {} as unknown as NodePgDatabase

const passkeyService = await import('@/server/domains/auth/passkey-service')
const userOps = await import('@/server/infra/db/operations/user')
const { DomainError } = await import('@/server/infra/http/errors')

function testUser(partial: Partial<SafeUser> = {}): SafeUser {
  return {
    id: '1',
    name: 'Test',
    email: 'test@example.com',
    role: 'admin',
    link: null,
    badgeName: null,
    badgeColor: null,
    badgeTextColor: null,
    isMuted: false,
    receiveEmail: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    lastIp: null,
    lastUa: null,
    passkeyForce: false,
    ...partial,
  } as SafeUser
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRedis.set.mockResolvedValue('OK')
  mockRedis.get.mockResolvedValue(null)
  mockRedis.del.mockResolvedValue(1)
  mockRedis.eval.mockResolvedValue(null)
})

describe('passkey-service — generateRegistrationOptions', () => {
  it('returns options and stores a challenge in Redis', async () => {
    swaMocks.generateRegistrationOptions.mockResolvedValue({
      challenge: 'test-challenge',
      rp: { name: 'Test', id: 'example.com' },
    })

    const dbEmptySelect = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => []) })) })),
    } as unknown as NodePgDatabase

    const result = await passkeyService.generateRegistrationOptions(dbEmptySelect, testUser())

    expect(result.options).toBeDefined()
    expect(result.options.challenge).toBe('test-challenge')
    expect(mockRedis.set).toHaveBeenCalledOnce()
    expect(mockRedis.set).toHaveBeenCalledWith(
      'passkey:reg-challenge:test-challenge',
      expect.stringContaining('"userId":"1"'),
      'EX',
      300,
    )
  })

  it('passes excludeCredentials from existing credentials', async () => {
    swaMocks.generateRegistrationOptions.mockResolvedValue({ challenge: 'c2', rp: { name: 'T', id: 'x' } })

    const dbWithSelect = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => [{ credentialId: 'cred-1' }]) })) })),
    } as unknown as NodePgDatabase

    await passkeyService.generateRegistrationOptions(dbWithSelect, testUser())

    expect(swaMocks.generateRegistrationOptions).toHaveBeenCalledOnce()
    const callArg = swaMocks.generateRegistrationOptions.mock.calls[0][0]
    expect(callArg.excludeCredentials).toEqual([{ id: 'cred-1', transports: [] }])
  })
})

describe('passkey-service — verifyRegistrationResponse', () => {
  it('verifies response and inserts credential', async () => {
    mockRedis.eval.mockResolvedValue(JSON.stringify({ userId: '1', deviceName: 'My Device' }))

    swaMocks.verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: 'cred-id',
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
          transports: ['internal'],
        },
        credentialBackedUp: false,
      },
    })

    const inserted: PasskeyCredentialRow = {
      id: 1n,
      userId: 1n,
      credentialId: 'cred-id',
      publicKey: Buffer.from([1, 2, 3]),
      counter: 0,
      transports: ['internal'],
      deviceName: 'My Device',
      backedUp: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const dbWithInsert = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => [inserted]),
        })),
      })),
    } as unknown as NodePgDatabase

    const result = await passkeyService.verifyRegistrationResponse(dbWithInsert, testUser(), {
      response: {
        id: 'cred-id',
        rawId: 'raw-id',
        response: { clientDataJSON: '', attestationObject: '' },
        clientExtensionResults: {},
        type: 'public-key',
      },
      challenge: 'test-challenge',
      deviceName: 'My Device',
    })

    expect(result.credentialId).toBe('cred-id')
    expect(mockRedis.eval).toHaveBeenCalledWith(expect.any(String), 1, 'passkey:reg-challenge:test-challenge')
  })

  it('throws DomainError when challenge is expired', async () => {
    mockRedis.eval.mockResolvedValue(null)

    await expect(
      passkeyService.verifyRegistrationResponse(db, testUser(), {
        response: {
          id: 'x',
          rawId: 'x',
          response: { clientDataJSON: '', attestationObject: '' },
          clientExtensionResults: {},
          type: 'public-key',
        },
        challenge: 'expired',
      }),
    ).rejects.toBeInstanceOf(DomainError)
  })

  it('throws DomainError on duplicate credential', async () => {
    mockRedis.eval.mockResolvedValue(JSON.stringify({ userId: '1' }))
    swaMocks.verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: { id: 'dup', publicKey: new Uint8Array([1]), counter: 0 },
        credentialBackedUp: false,
      },
    })

    const dbWithConflict = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => {
            const err = new Error('unique constraint violation')
            throw err
          }),
        })),
      })),
    } as unknown as NodePgDatabase

    await expect(
      passkeyService.verifyRegistrationResponse(dbWithConflict, testUser(), {
        response: {
          id: 'dup',
          rawId: 'dup',
          response: { clientDataJSON: '', attestationObject: '' },
          clientExtensionResults: {},
          type: 'public-key',
        },
        challenge: 'c',
      }),
    ).rejects.toBeInstanceOf(DomainError)
  })

  it('throws DomainError when challenge belongs to a different user', async () => {
    mockRedis.eval.mockResolvedValue(JSON.stringify({ userId: '999' }))

    await expect(
      passkeyService.verifyRegistrationResponse(db, testUser({ id: 1n } as any), {
        response: {
          id: 'x',
          rawId: 'x',
          response: { clientDataJSON: '', attestationObject: '' },
          clientExtensionResults: {},
          type: 'public-key',
        },
        challenge: 'wrong-user',
      }),
    ).rejects.toBeInstanceOf(DomainError)
  })

  it('throws DomainError when SWA verification returns verified: false', async () => {
    mockRedis.eval.mockResolvedValue(JSON.stringify({ userId: '1' }))
    swaMocks.verifyRegistrationResponse.mockResolvedValue({
      verified: false,
    })

    await expect(
      passkeyService.verifyRegistrationResponse(db, testUser(), {
        response: {
          id: 'x',
          rawId: 'x',
          response: { clientDataJSON: '', attestationObject: '' },
          clientExtensionResults: {},
          type: 'public-key',
        },
        challenge: 'c',
      }),
    ).rejects.toBeInstanceOf(DomainError)
  })
})

describe('passkey-service — generateAuthenticationOptions', () => {
  it('returns options without allowCredentials when email is absent', async () => {
    swaMocks.generateAuthenticationOptions.mockResolvedValue({ challenge: 'auth-c', rpId: 'example.com' })

    const result = await passkeyService.generateAuthenticationOptions(db)

    expect(result.options).toBeDefined()
    const callArg = swaMocks.generateAuthenticationOptions.mock.calls[0][0]
    expect(callArg.allowCredentials).toBeUndefined()
    expect(mockRedis.set).toHaveBeenCalledWith(
      'passkey:auth-challenge:auth-c',
      expect.stringContaining('"email":null'),
      'EX',
      300,
    )
  })

  it('returns options with allowCredentials for known email', async () => {
    swaMocks.generateAuthenticationOptions.mockResolvedValue({ challenge: 'auth-c2', rpId: 'example.com' })
    vi.mocked(userOps.findUserByEmail).mockResolvedValue({
      id: 1n,
      email: 'test@example.com',
      name: 'Test',
      role: 'admin',
    } as any)

    const dbWithSelect = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => [{ credentialId: 'cred-1', transports: ['internal'] }]),
        })),
      })),
    } as unknown as NodePgDatabase

    const result = await passkeyService.generateAuthenticationOptions(dbWithSelect, 'test@example.com')

    expect(result.options).toBeDefined()
    const callArg = swaMocks.generateAuthenticationOptions.mock.calls[0][0]
    expect(callArg.allowCredentials).toEqual([{ id: 'cred-1', transports: ['internal'] }])
  })
})

describe('passkey-service — verifyAuthenticationResponse', () => {
  it('verifies and updates counter', async () => {
    mockRedis.eval.mockResolvedValue(JSON.stringify({ email: 'test@example.com' }))

    swaMocks.verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: {
        credentialID: 'cred-1',
        newCounter: 5,
        userVerified: true,
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
        origin: 'https://example.com',
        rpID: 'example.com',
      },
    })

    const dbWithOps = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => [
              {
                id: 1n,
                userId: 1n,
                credentialId: 'cred-1',
                publicKey: Buffer.from([1, 2, 3]),
                counter: 0,
                transports: ['internal'],
                deviceName: null,
                backedUp: false,
                createdAt: new Date(),
              },
            ]),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve()),
        })),
      })),
    } as unknown as NodePgDatabase

    vi.mocked(userOps.findUserById).mockResolvedValue(testUser({ id: 1n, role: 'admin' }) as any)

    const result = await passkeyService.verifyAuthenticationResponse(
      dbWithOps,
      {
        id: 'cred-1',
        rawId: 'raw',
        response: { clientDataJSON: '', authenticatorData: '', signature: '' },
        clientExtensionResults: {},
        type: 'public-key',
      },
      'auth-c',
    )

    expect(result.user.id).toBe(1n)
    expect(result.authMethod).toBe('passkey')
  })

  it('throws DomainError when challenge is expired', async () => {
    mockRedis.eval.mockResolvedValue(null)

    await expect(
      passkeyService.verifyAuthenticationResponse(
        db,
        {
          id: 'x',
          rawId: 'x',
          response: { clientDataJSON: '', authenticatorData: '', signature: '' },
          clientExtensionResults: {},
          type: 'public-key',
        },
        'expired',
      ),
    ).rejects.toBeInstanceOf(DomainError)
  })

  it('throws DomainError when credential not found', async () => {
    mockRedis.eval.mockResolvedValue(JSON.stringify({ email: 'test@example.com' }))

    const dbEmptySelect = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => []),
          })),
        })),
      })),
    } as unknown as NodePgDatabase

    await expect(
      passkeyService.verifyAuthenticationResponse(
        dbEmptySelect,
        {
          id: 'nonexistent',
          rawId: 'raw',
          response: { clientDataJSON: '', authenticatorData: '', signature: '' },
          clientExtensionResults: {},
          type: 'public-key',
        },
        'auth-c',
      ),
    ).rejects.toBeInstanceOf(DomainError)
  })

  it('throws DomainError when SWA verification returns verified: false', async () => {
    mockRedis.eval.mockResolvedValue(JSON.stringify({ email: 'test@example.com' }))
    swaMocks.verifyAuthenticationResponse.mockResolvedValue({
      verified: false,
    })

    const dbWithOps = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => [
              {
                id: 1n,
                userId: 1n,
                credentialId: 'cred-1',
                publicKey: Buffer.from([1, 2, 3]),
                counter: 0,
                transports: ['internal'],
                deviceName: null,
                backedUp: false,
                createdAt: new Date(),
              },
            ]),
          })),
        })),
      })),
    } as unknown as NodePgDatabase

    await expect(
      passkeyService.verifyAuthenticationResponse(
        dbWithOps,
        {
          id: 'cred-1',
          rawId: 'raw',
          response: { clientDataJSON: '', authenticatorData: '', signature: '' },
          clientExtensionResults: {},
          type: 'public-key',
        },
        'auth-c',
      ),
    ).rejects.toBeInstanceOf(DomainError)
  })
})

describe('passkey-service — credential management', () => {
  it('lists credentials ordered by createdAt', async () => {
    const rows = [
      { id: 1n, credentialId: 'c1', deviceName: 'Phone', createdAt: new Date('2024-01-01'), backedUp: false },
      { id: 2n, credentialId: 'c2', deviceName: 'Laptop', createdAt: new Date('2024-01-02'), backedUp: true },
    ]
    const dbWithSelect = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => rows),
          })),
        })),
      })),
    } as unknown as NodePgDatabase

    const result = await passkeyService.listCredentials(dbWithSelect, 1n)
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('c1')
    expect(result[1].id).toBe('c2')
  })

  it('deletes a credential by id and userId', async () => {
    const dbWithDelete = {
      delete: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => [{ id: 1n }]),
        })),
      })),
    } as unknown as NodePgDatabase

    const result = await passkeyService.deleteCredential(dbWithDelete, 'c1', 1n)
    expect(result).toBe(true)
  })

  it('deletes all credentials for a user', async () => {
    const dbWithDelete = {
      delete: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => [{ id: 1n }, { id: 2n }]),
        })),
      })),
    } as unknown as NodePgDatabase

    const result = await passkeyService.deleteAllCredentials(dbWithDelete, 1n)
    expect(result).toBe(2)
  })

  it('counts credentials', async () => {
    const dbWithCount = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => [{ count: 3 }]),
        })),
      })),
    } as unknown as NodePgDatabase

    const result = await passkeyService.countCredentials(dbWithCount, 1n)
    expect(result).toBe(3)
  })

  it('sets and gets passkeyForce', async () => {
    const dbWithUpdate = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve()),
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => [{ passkeyForce: true }]),
          })),
        })),
      })),
    } as unknown as NodePgDatabase

    await passkeyService.setPasskeyForce(dbWithUpdate, 1n, true)
    const force = await passkeyService.getPasskeyForce(dbWithUpdate, 1n)
    expect(force).toBe(true)
  })
})
