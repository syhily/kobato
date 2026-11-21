import { findSettingByScope } from '@kobato/db/operations/setting'
import { setting } from '@kobato/db/schema/config'
import { serverConfig } from '@kobato/server/infra/config'
import { encryptIfNeeded } from '@kobato/server/infra/crypto/secret-encryption'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { migrateSecretsEncryption } = await import('@kobato/server/domains/settings/services/migrate-secrets')

const db = getTestDb()

function encryptLegacy(plaintext: string, key: string): string {
  const derived = createHash('sha256').update(key).digest()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', derived, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `enc:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

async function seedSetting(scope: string, data: Record<string, unknown>): Promise<void> {
  await db.insert(setting).values({ scope, data })
}

async function readData(scope: string): Promise<Record<string, unknown>> {
  const row = findSettingByScope(db, scope)
  expect(row).not.toBeNull()
  return row!.data as Record<string, unknown>
}

beforeEach(async () => {
  await clearAllTables(db)
  vi.stubEnv('VITEST', 'false')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('migrateSecretsEncryption', () => {
  it('is skipped in test mode', async () => {
    vi.stubEnv('VITEST', 'true')
    await seedSetting('blog.mail', { mail: { smtpPass: 'plain-mail-key' } })

    await migrateSecretsEncryption(db)

    expect(await readData('blog.mail')).toEqual({ mail: { smtpPass: 'plain-mail-key' } })
  })

  it('encrypts plaintext secrets in place with the enc2: format and upserts only dirty scopes', async () => {
    await seedSetting('blog.mail', { mail: { smtpPass: 'plain-mail-key' } })
    await seedSetting('blog.assets', { storage: { secretAccessKey: 'plain-s3-key' } })

    await migrateSecretsEncryption(db)

    const mail = (await readData('blog.mail')).mail as Record<string, unknown>
    const storage = (await readData('blog.assets')).storage as Record<string, unknown>
    expect(mail.smtpPass).toMatch(/^enc2:/)
    expect(storage.secretAccessKey).toMatch(/^enc2:/)
    const { decryptIfNeeded } = await import('@kobato/server/infra/crypto/secret-encryption')
    expect(decryptIfNeeded(mail.smtpPass as string)).toBe('plain-mail-key')
    expect(decryptIfNeeded(storage.secretAccessKey as string)).toBe('plain-s3-key')
  })

  it('leaves already-encrypted (enc2:) secrets untouched', async () => {
    const ciphertext = encryptIfNeeded('already-encrypted')
    expect(ciphertext).toMatch(/^enc2:/)
    await seedSetting('blog.mail', { mail: { smtpPass: ciphertext } })
    const before = await readData('blog.mail')

    await migrateSecretsEncryption(db)

    expect(await readData('blog.mail')).toEqual(before)
  })

  it('verifies legacy enc: values encrypted with the old SHA-256 key without rewriting them', async () => {
    const legacy = encryptLegacy('legacy-secret', serverConfig.security.encryptionKey)
    expect(legacy).toMatch(/^enc:/)
    await seedSetting('blog.mail', { mail: { smtpPass: legacy } })
    const before = await readData('blog.mail')

    await migrateSecretsEncryption(db)

    expect(await readData('blog.mail')).toEqual(before)
  })

  it('skips empty strings and missing secret paths', async () => {
    await seedSetting('blog.mail', { mail: { smtpPass: '' } })
    await seedSetting('blog.assets', { storage: { accessKeyId: 'not-a-secret' } })

    await migrateSecretsEncryption(db)

    expect(await readData('blog.mail')).toEqual({ mail: { smtpPass: '' } })
    expect(await readData('blog.assets')).toEqual({ storage: { accessKeyId: 'not-a-secret' } })
  })

  it('aborts without touching the row when a ciphertext cannot be decrypted with the current key', async () => {
    const wrongKeyCiphertext = encryptLegacy('secret-value', 'totally-different-key-32-chars!!')
    await seedSetting('blog.mail', { mail: { smtpPass: wrongKeyCiphertext } })
    const before = await readData('blog.mail')

    await expect(migrateSecretsEncryption(db)).rejects.toThrow(/Secrets encryption migration aborted/)

    expect(await readData('blog.mail')).toEqual(before)
  })
})
