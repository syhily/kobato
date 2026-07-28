import superjson from 'superjson'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '@/server/infra/db/database'
import type { SafeUser } from '@/server/infra/db/operations/user'
import type { PasskeyCredentialRow } from '@/server/infra/db/types'

// passkey/service.ts stores challenges in the `one_time_token` table and
// credentials in `passkey_credential`, both through drizzle chains on the
// threaded `db`. The db doubles below hand-roll those chains and capture
// the values/returning payloads so each test can shape them.

const swaMocks = {
  generateRegistrationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}

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
  getBlogSettingsBundleSync: vi.fn(() => ({
    siteIdentity: { title: 'Test', website: 'https://example.com' },
    security: { passkey: { enabled: true } },
  })),
}))

vi.mock('@/server/infra/db/operations/user', () => ({
  findUserByEmail: vi.fn(),
  findSafeUserById: vi.fn(),
}))

const db = {} as unknown as Database

const passkeyService = await import('@/server/domains/auth/passkey/service')
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
    loginMethod: 'password',
    ...partial,
  } as SafeUser
}

/** superjson envelope, exactly as `storeChallenge` writes it. */
function challengePayload(data: Record<string, unknown>) {
  return superjson.serialize(data)
}

interface ChallengeCapture {
  key?: string
  payload?: unknown
  expiresAt?: Date
}

/** db double whose insert chain captures one_time_token writes. */
function dbWithTokenInsert(capture: ChallengeCapture, selectRows: unknown[] = []): Database {
  return {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => selectRows) })) })),
    insert: vi.fn(() => ({
      values: vi.fn((values: { key: string; payload: unknown; expiresAt: Date }) => {
        capture.key = values.key
        capture.payload = values.payload
        capture.expiresAt = values.expiresAt
        return { onConflictDoUpdate: vi.fn(async () => undefined) }
      }),
    })),
  } as unknown as Database
}

/** db double whose delete chain serves the consume-challenge rows. */
function dbWithChallengeConsume(consumeRows: { payload: unknown }[]): {
  db: Database
  deleteSpy: ReturnType<typeof vi.fn>
} {
  const deleteSpy = vi.fn(() => ({
    where: vi.fn(() => ({
      returning: vi.fn(async () => consumeRows),
    })),
  }))
  return { db: { delete: deleteSpy } as unknown as Database, deleteSpy }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('passkey/service — generateRegistrationOptions', () => {
  it('returns options and stores a challenge row', async () => {
    swaMocks.generateRegistrationOptions.mockResolvedValue({
      challenge: 'test-challenge',
      rp: { name: 'Test', id: 'example.com' },
    })

    const capture: ChallengeCapture = {}
    const result = await passkeyService.generateRegistrationOptions(dbWithTokenInsert(capture), testUser())

    expect(result.options).toBeDefined()
    expect(result.options.challenge).toBe('test-challenge')
    expect(capture.key).toBe('passkey:reg-challenge:test-challenge')
    expect(capture.payload).toEqual(challengePayload({ userId: '1', deviceName: null }))
    // 300s TTL.
    expect(capture.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 290_000)
    expect(capture.expiresAt!.getTime()).toBeLessThanOrEqual(Date.now() + 300_000)
  })

  it('passes excludeCredentials with stored transports', async () => {
    swaMocks.generateRegistrationOptions.mockResolvedValue({ challenge: 'c2', rp: { name: 'T', id: 'x' } })

    const capture: ChallengeCapture = {}
    await passkeyService.generateRegistrationOptions(
      dbWithTokenInsert(capture, [{ credentialId: 'cred-1', transports: ['internal'] }]),
      testUser(),
    )

    expect(swaMocks.generateRegistrationOptions).toHaveBeenCalledOnce()
    const callArg = swaMocks.generateRegistrationOptions.mock.calls[0][0]
    expect(callArg.excludeCredentials).toEqual([{ id: 'cred-1', transports: ['internal'] }])
  })
})

describe('passkey/service — verifyRegistrationResponse', () => {
  it('verifies response and inserts credential', async () => {
    const { db: consumeDb } = dbWithChallengeConsume([
      { payload: challengePayload({ userId: '1', deviceName: 'My Device' }) },
    ])

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
      id: 1,
      userId: 1,
      credentialId: 'cred-id',
      publicKey: Buffer.from([1, 2, 3]),
      counter: 0,
      transports: ['internal'],
      deviceName: 'My Device',
      backedUp: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const dbWithOps = {
      ...consumeDb,
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => [inserted]),
        })),
      })),
    } as unknown as Database

    const result = await passkeyService.verifyRegistrationResponse(dbWithOps, testUser(), {
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
  })

  it('throws DomainError when challenge is expired (consume returns no row)', async () => {
    const { db: consumeDb } = dbWithChallengeConsume([])

    await expect(
      passkeyService.verifyRegistrationResponse(consumeDb, testUser(), {
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
    const { db: consumeDb } = dbWithChallengeConsume([{ payload: challengePayload({ userId: '1' }) }])
    swaMocks.verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: { id: 'dup', publicKey: new Uint8Array([1]), counter: 0 },
        credentialBackedUp: false,
      },
    })

    const dbWithConflict = {
      ...consumeDb,
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => {
            throw new Error('unique constraint violation')
          }),
        })),
      })),
    } as unknown as Database

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
    const { db: consumeDb } = dbWithChallengeConsume([{ payload: challengePayload({ userId: '999' }) }])

    await expect(
      passkeyService.verifyRegistrationResponse(consumeDb, testUser({ id: 1 } as any), {
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
    const { db: consumeDb } = dbWithChallengeConsume([{ payload: challengePayload({ userId: '1' }) }])
    swaMocks.verifyRegistrationResponse.mockResolvedValue({
      verified: false,
    })

    await expect(
      passkeyService.verifyRegistrationResponse(consumeDb, testUser(), {
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

describe('passkey/service — generateAuthenticationOptions', () => {
  it('returns options without allowCredentials when email is absent', async () => {
    swaMocks.generateAuthenticationOptions.mockResolvedValue({ challenge: 'auth-c', rpId: 'example.com' })

    const capture: ChallengeCapture = {}
    const result = await passkeyService.generateAuthenticationOptions(dbWithTokenInsert(capture))

    expect(result.options).toBeDefined()
    const callArg = swaMocks.generateAuthenticationOptions.mock.calls[0][0]
    expect(callArg.allowCredentials).toBeUndefined()
    expect(capture.key).toBe('passkey:auth-challenge:auth-c')
    expect(capture.payload).toEqual(challengePayload({ email: null }))
  })

  it('returns options with allowCredentials for known email', async () => {
    swaMocks.generateAuthenticationOptions.mockResolvedValue({ challenge: 'auth-c2', rpId: 'example.com' })
    vi.mocked(userOps.findUserByEmail).mockResolvedValue({
      id: 1,
      email: 'test@example.com',
      name: 'Test',
      role: 'admin',
    } as any)

    const capture: ChallengeCapture = {}
    const result = await passkeyService.generateAuthenticationOptions(
      dbWithTokenInsert(capture, [{ credentialId: 'cred-1', transports: ['internal'] }]),
      'test@example.com',
    )

    expect(result.options).toBeDefined()
    const callArg = swaMocks.generateAuthenticationOptions.mock.calls[0][0]
    expect(callArg.allowCredentials).toEqual([{ id: 'cred-1', transports: ['internal'] }])
  })
})

describe('passkey/service — verifyAuthenticationResponse', () => {
  it('verifies and updates counter', async () => {
    const { db: consumeDb } = dbWithChallengeConsume([{ payload: challengePayload({ email: 'test@example.com' }) }])

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
      ...consumeDb,
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => [
              {
                id: 1,
                userId: 1,
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
    } as unknown as Database

    vi.mocked(userOps.findSafeUserById).mockResolvedValue(testUser({ id: 1, role: 'admin' }) as any)

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

    expect(result.user.id).toBe(1)
    expect(result.authMethod).toBe('passkey')
    // The returned user is the SafeUser accessor result verbatim — the
    // hand-rolled sensitive-field strip is gone.
    expect(result.user).not.toHaveProperty('password')
    expect(result.user).not.toHaveProperty('lastIp')
    expect(result.user).not.toHaveProperty('lastUa')
  })

  it('throws DomainError when challenge is expired', async () => {
    const { db: consumeDb } = dbWithChallengeConsume([])

    await expect(
      passkeyService.verifyAuthenticationResponse(
        consumeDb,
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
    const { db: consumeDb } = dbWithChallengeConsume([{ payload: challengePayload({ email: 'test@example.com' }) }])

    const dbEmptySelect = {
      ...consumeDb,
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => []),
          })),
        })),
      })),
    } as unknown as Database

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
    const { db: consumeDb } = dbWithChallengeConsume([{ payload: challengePayload({ email: 'test@example.com' }) }])
    swaMocks.verifyAuthenticationResponse.mockResolvedValue({
      verified: false,
    })

    const dbWithOps = {
      ...consumeDb,
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => [
              {
                id: 1,
                userId: 1,
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
    } as unknown as Database

    await expect(
      passkeyService.verifyAuthenticationResponse(
        dbWithOps,
        {
          id: 'x',
          rawId: 'x',
          response: { clientDataJSON: '', authenticatorData: '', signature: '' },
          clientExtensionResults: {},
          type: 'public-key',
        },
        'auth-c',
      ),
    ).rejects.toBeInstanceOf(DomainError)
  })
})

describe('passkey/service — credential management', () => {
  it('lists credentials ordered by createdAt', async () => {
    const rows = [
      { id: 1, credentialId: 'c1', deviceName: 'Phone', createdAt: new Date('2024-01-01'), backedUp: false },
      { id: 2, credentialId: 'c2', deviceName: 'Laptop', createdAt: new Date('2024-01-02'), backedUp: true },
    ]
    const dbWithSelect = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => rows),
          })),
        })),
      })),
    } as unknown as Database

    const result = await passkeyService.listCredentials(dbWithSelect, 1)
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('c1')
    expect(result[1].id).toBe('c2')
  })

  it('deletes a credential by id and userId', async () => {
    const dbWithOps = {
      delete: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => [{ id: 1 }]),
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => [{ id: 2 }]),
          })),
        })),
      })),
    } as unknown as Database

    const result = await passkeyService.deleteCredential(dbWithOps, 'c1', 1)
    expect(result).toBe(true)
  })

  it('deletes all credentials for a user', async () => {
    const dbWithOps = {
      delete: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => [{ id: 1 }, { id: 2 }]),
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => []),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve()),
        })),
      })),
    } as unknown as Database

    const result = await passkeyService.deleteAllCredentials(dbWithOps, 1)
    expect(result).toBe(2)
  })

  it('sets the login method', async () => {
    const updateSpy = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    }))
    const dbWithUpdate = { update: updateSpy } as unknown as Database

    await passkeyService.setLoginMethod(dbWithUpdate, 1, 'password')
    expect(updateSpy).toHaveBeenCalledTimes(1)
  })
})

describe('passkey/service — login-method/credential invariant', () => {
  function dbWithCredentialCount(remaining: { id: number }[]) {
    const updateSpy = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    }))
    const selectSpy = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => remaining),
        })),
      })),
    }))
    const db = {
      delete: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => [{ id: 1 }]),
        })),
      })),
      select: selectSpy,
      update: updateSpy,
    } as unknown as Database
    return { db, selectSpy, updateSpy }
  }

  it('reverts loginMethod to password when deleteCredential removes the last credential', async () => {
    const { db, updateSpy } = dbWithCredentialCount([])
    const result = await passkeyService.deleteCredential(db, 'c1', 1)
    expect(result).toBe(true)
    expect(updateSpy).toHaveBeenCalledTimes(1)
  })

  it('preserves loginMethod when credentials remain after deleteCredential', async () => {
    const { db, updateSpy } = dbWithCredentialCount([{ id: 2 }])
    const result = await passkeyService.deleteCredential(db, 'c1', 1)
    expect(result).toBe(true)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('does not touch loginMethod when deleteCredential matches nothing', async () => {
    const { db, selectSpy, updateSpy } = dbWithCredentialCount([])
    db.delete = vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(() => []),
      })),
    })) as unknown as Database['delete']

    const result = await passkeyService.deleteCredential(db, 'nope', 1)
    expect(result).toBe(false)
    expect(selectSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('reverts loginMethod to password after deleteAllCredentials leaves zero credentials', async () => {
    const { db, updateSpy } = dbWithCredentialCount([])
    const result = await passkeyService.deleteAllCredentials(db, 1)
    expect(result).toBe(1)
    expect(updateSpy).toHaveBeenCalledTimes(1)
  })

  it('rejects choosing passkey when no credentials exist', async () => {
    const { db, updateSpy } = dbWithCredentialCount([])
    await expect(passkeyService.setLoginMethod(db, 1, 'passkey')).rejects.toBeInstanceOf(DomainError)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('chooses passkey when at least one credential exists', async () => {
    const { db, updateSpy } = dbWithCredentialCount([{ id: 1 }])
    await passkeyService.setLoginMethod(db, 1, 'passkey')
    expect(updateSpy).toHaveBeenCalledTimes(1)
  })

  it('switches back to password without checking credentials', async () => {
    const { db, selectSpy, updateSpy } = dbWithCredentialCount([])
    await passkeyService.setLoginMethod(db, 1, 'password')
    expect(selectSpy).not.toHaveBeenCalled()
    expect(updateSpy).toHaveBeenCalledTimes(1)
  })
})

describe('passkey/service — rpConfig validation', () => {
  it('rejects non-HTTPS origin', async () => {
    const { requireBlogSettingsBundle } = await import('@/shared/config/getters')
    vi.mocked(requireBlogSettingsBundle).mockReturnValueOnce({
      siteIdentity: { title: 'Test', website: 'http://example.com' },
    } as any)

    await expect(passkeyService.generateRegistrationOptions(db, testUser())).rejects.toBeInstanceOf(DomainError)
  })

  it('rejects private IPv4 192.168.x', async () => {
    const { requireBlogSettingsBundle } = await import('@/shared/config/getters')
    vi.mocked(requireBlogSettingsBundle).mockReturnValueOnce({
      siteIdentity: { title: 'Test', website: 'https://192.168.1.1' },
    } as any)

    await expect(passkeyService.generateRegistrationOptions(db, testUser())).rejects.toBeInstanceOf(DomainError)
  })

  it('rejects IPv6 ULA fc00::1', async () => {
    const { requireBlogSettingsBundle } = await import('@/shared/config/getters')
    vi.mocked(requireBlogSettingsBundle).mockReturnValueOnce({
      siteIdentity: { title: 'Test', website: 'https://[fc00::1]' },
    } as any)

    await expect(passkeyService.generateRegistrationOptions(db, testUser())).rejects.toBeInstanceOf(DomainError)
  })

  it('allows valid public HTTPS domain', async () => {
    const { requireBlogSettingsBundle } = await import('@/shared/config/getters')
    vi.mocked(requireBlogSettingsBundle).mockReturnValueOnce({
      siteIdentity: { title: 'Test', website: 'https://example.com' },
    } as any)
    swaMocks.generateRegistrationOptions.mockResolvedValue({
      challenge: 'c',
      rp: { name: 'Test', id: 'example.com' },
    })

    const capture: ChallengeCapture = {}
    const result = await passkeyService.generateRegistrationOptions(dbWithTokenInsert(capture), testUser())
    expect(result.options).toBeDefined()
  })
})
