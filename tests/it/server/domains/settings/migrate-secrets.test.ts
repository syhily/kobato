import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  encryptionKey: 'test-encryption-key-32-chars-long!!',
  vitest: false,
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
  findSettingsByScopePrefix: vi.fn(),
  upsertSetting: vi.fn(),
}))

vi.mock('@/server/infra/config', () => ({
  get serverConfig() {
    return {
      server: {},
      database: {},
      security: { encryptionKey: mockState.encryptionKey },
      storage: {},
    }
  },
  isVitest() {
    return mockState.vitest
  },
}))

vi.mock('@/server/infra/logger', () => ({
  getLogger: () => mockState.logger,
}))

vi.mock('@/server/infra/db/operations/setting', () => ({
  findSettingsByScopePrefix: mockState.findSettingsByScopePrefix,
  upsertSetting: mockState.upsertSetting,
}))

const db = {} as NodePgDatabase

function encryptWithKey(plaintext: string, key: string): string {
  const derived = createHash('sha256').update(key).digest()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', derived, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `enc:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

async function loadMigration() {
  const mod = await import('@/server/domains/settings/services/migrate-secrets')
  return mod.migrateSecretsEncryption
}

describe('migrateSecretsEncryption', () => {
  beforeEach(() => {
    vi.resetModules()
    mockState.vitest = false
    mockState.encryptionKey = 'test-encryption-key-32-chars-long!!'
    mockState.logger.error.mockClear()
    mockState.logger.warn.mockClear()
    mockState.logger.info.mockClear()
    mockState.logger.debug.mockClear()
    mockState.findSettingsByScopePrefix.mockReset()
    mockState.upsertSetting.mockReset()
  })

  it('is skipped in test mode', async () => {
    mockState.vitest = true
    const migrate = await loadMigration()
    await migrate(db)
    expect(mockState.findSettingsByScopePrefix).not.toHaveBeenCalled()
  })

  it('encrypts plaintext secrets and upserts dirty scopes', async () => {
    mockState.findSettingsByScopePrefix.mockResolvedValue([
      {
        scope: 'blog.mail',
        data: { mail: { apiKey: 'plain-mail-key' } },
      },
      {
        scope: 'blog.assets',
        data: { storage: { secretAccessKey: 'plain-s3-key' } },
      },
    ])
    mockState.upsertSetting.mockImplementation(async (_db, data, _updatedBy, scope) => ({ scope, data }))

    const migrate = await loadMigration()
    await migrate(db)

    expect(mockState.findSettingsByScopePrefix).toHaveBeenCalledWith(db, 'blog.')
    expect(mockState.upsertSetting).toHaveBeenCalledTimes(2)

    const mailCall = mockState.upsertSetting.mock.calls.find((c) => c[3] === 'blog.mail')
    const assetsCall = mockState.upsertSetting.mock.calls.find((c) => c[3] === 'blog.assets')

    expect(mailCall).toBeDefined()
    expect(assetsCall).toBeDefined()

    const mailData = mailCall![1] as Record<string, unknown>
    const assetsData = assetsCall![1] as Record<string, unknown>

    expect((mailData.mail as Record<string, unknown>).apiKey).toMatch(/^enc2:/)
    expect((assetsData.storage as Record<string, unknown>).secretAccessKey).toMatch(/^enc2:/)

    expect(mockState.logger.info).toHaveBeenCalledWith(expect.stringContaining('2 encrypted, 0 verified'))
  })

  it('skips already-encrypted secrets and verifies them', async () => {
    const ciphertext = encryptWithKey('already-encrypted', mockState.encryptionKey)

    mockState.findSettingsByScopePrefix.mockResolvedValue([
      {
        scope: 'blog.mail',
        data: { mail: { apiKey: ciphertext } },
      },
    ])

    const migrate = await loadMigration()
    await migrate(db)

    expect(mockState.upsertSetting).not.toHaveBeenCalled()
    expect(mockState.logger.info).toHaveBeenCalledWith(expect.stringContaining('0 encrypted, 1 verified'))
  })

  it('skips empty strings and missing paths', async () => {
    mockState.findSettingsByScopePrefix.mockResolvedValue([
      {
        scope: 'blog.mail',
        data: { mail: { apiKey: '' } },
      },
      {
        scope: 'blog.assets',
        data: { storage: { accessKeyId: 'not-a-secret' } },
      },
    ])

    const migrate = await loadMigration()
    await migrate(db)

    expect(mockState.upsertSetting).not.toHaveBeenCalled()
  })

  it('throws when an encrypted secret cannot be decrypted with the current key', async () => {
    const wrongKeyCiphertext = encryptWithKey('secret-value', 'totally-different-key-32-chars!!')

    mockState.findSettingsByScopePrefix.mockResolvedValue([
      {
        scope: 'blog.mail',
        data: { mail: { apiKey: wrongKeyCiphertext } },
      },
    ])

    const migrate = await loadMigration()
    await expect(migrate(db)).rejects.toThrow(/Secrets encryption migration aborted/)

    expect(mockState.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('failed to decrypt'),
      expect.objectContaining({ error: expect.any(Error) }),
    )
  })

  it('encrypts new values with the enc2: prefix (HKDF-derived key)', async () => {
    mockState.findSettingsByScopePrefix.mockResolvedValue([
      {
        scope: 'blog.mail',
        data: { mail: { apiKey: 'plain-mail-key' } },
      },
    ])
    mockState.upsertSetting.mockImplementation(async (_db, data, _updatedBy, scope) => ({ scope, data }))

    const migrate = await loadMigration()
    await migrate(db)

    const [, data] = mockState.upsertSetting.mock.calls[0]
    const mailData = data as Record<string, unknown>
    const apiKey = (mailData.mail as Record<string, unknown>).apiKey as string
    expect(apiKey).toMatch(/^enc2:/)
  })

  it('decrypts legacy enc: values encrypted with the old SHA-256 key', async () => {
    const legacyCiphertext = encryptWithKey('legacy-secret', mockState.encryptionKey)
    expect(legacyCiphertext).toMatch(/^enc:/)

    mockState.findSettingsByScopePrefix.mockResolvedValue([
      {
        scope: 'blog.mail',
        data: { mail: { apiKey: legacyCiphertext } },
      },
    ])

    const migrate = await loadMigration()
    await migrate(db)

    expect(mockState.upsertSetting).not.toHaveBeenCalled()
    expect(mockState.logger.info).toHaveBeenCalledWith(expect.stringContaining('0 encrypted, 1 verified'))
  })

  it('throws when a secret fails to encrypt', async () => {
    mockState.findSettingsByScopePrefix.mockRejectedValue(new Error('DB connection lost'))

    const migrate = await loadMigration()
    await expect(migrate(db)).rejects.toThrow('DB connection lost')

    expect(mockState.logger.error).toHaveBeenCalledWith(
      'Secrets encryption migration failed',
      expect.objectContaining({ error: expect.any(Error) }),
    )
  })
})
