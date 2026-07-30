import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { serverConfig } from '@/server/infra/config'
import { encryptIfNeeded } from '@/server/infra/crypto/secret-encryption'
import { findSettingByScope } from '@/server/infra/db/operations/setting'
import { setting } from '@/server/infra/db/schema/config'

// The migration no-ops under `isVitest()` so test boots never rewrite
// secrets. Flip ONLY that gate — the real config (including the real
// test encryption key) and the real secret-encryption module stay in
// place — so the migration body runs against the real in-memory engine.
// The gate defaults to `true` so the db-lifecycle import-time
// `if (!isVitest())` branch sees the same value as an unmocked boot.
const gate = vi.hoisted(() => ({ vitest: true }))

vi.mock('@/server/infra/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/infra/config')>()
  return { ...actual, isVitest: () => gate.vitest }
})

const { migrateSecretsEncryption } = await import('@/server/domains/settings/services/migrate-secrets')

const db = getTestDb()

// The legacy v1 format: AES-256-GCM with the SHA-256 of the configured
// key. The migration must still verify (not re-encrypt) these rows.
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
  gate.vitest = false
})

describe('migrateSecretsEncryption', () => {
  it('is skipped in test mode', async () => {
    gate.vitest = true
    await seedSetting('blog.mail', { mail: { apiKey: 'plain-mail-key' } })

    await migrateSecretsEncryption(db)

    expect(await readData('blog.mail')).toEqual({ mail: { apiKey: 'plain-mail-key' } })
  })

  it('encrypts plaintext secrets in place with the enc2: format and upserts only dirty scopes', async () => {
    await seedSetting('blog.mail', { mail: { apiKey: 'plain-mail-key' } })
    await seedSetting('blog.assets', { storage: { secretAccessKey: 'plain-s3-key' } })

    await migrateSecretsEncryption(db)

    const mail = (await readData('blog.mail')).mail as Record<string, unknown>
    const storage = (await readData('blog.assets')).storage as Record<string, unknown>
    // New ciphertexts carry the HKDF-deployment-key format…
    expect(mail.apiKey).toMatch(/^enc2:/)
    expect(storage.secretAccessKey).toMatch(/^enc2:/)
    // …and round-trip back to the original plaintext with the real key.
    const { decryptIfNeeded } = await import('@/server/infra/crypto/secret-encryption')
    expect(decryptIfNeeded(mail.apiKey as string)).toBe('plain-mail-key')
    expect(decryptIfNeeded(storage.secretAccessKey as string)).toBe('plain-s3-key')
  })

  it('leaves already-encrypted (enc2:) secrets untouched', async () => {
    const ciphertext = encryptIfNeeded('already-encrypted')
    expect(ciphertext).toMatch(/^enc2:/)
    await seedSetting('blog.mail', { mail: { apiKey: ciphertext } })
    const before = await readData('blog.mail')

    await migrateSecretsEncryption(db)

    expect(await readData('blog.mail')).toEqual(before)
  })

  it('verifies legacy enc: values encrypted with the old SHA-256 key without rewriting them', async () => {
    const legacy = encryptLegacy('legacy-secret', serverConfig.security.encryptionKey)
    expect(legacy).toMatch(/^enc:/)
    await seedSetting('blog.mail', { mail: { apiKey: legacy } })
    const before = await readData('blog.mail')

    await migrateSecretsEncryption(db)

    expect(await readData('blog.mail')).toEqual(before)
  })

  it('skips empty strings and missing secret paths', async () => {
    await seedSetting('blog.mail', { mail: { apiKey: '' } })
    await seedSetting('blog.assets', { storage: { accessKeyId: 'not-a-secret' } })

    await migrateSecretsEncryption(db)

    expect(await readData('blog.mail')).toEqual({ mail: { apiKey: '' } })
    expect(await readData('blog.assets')).toEqual({ storage: { accessKeyId: 'not-a-secret' } })
  })

  it('aborts without touching the row when a ciphertext cannot be decrypted with the current key', async () => {
    const wrongKeyCiphertext = encryptLegacy('secret-value', 'totally-different-key-32-chars!!')
    await seedSetting('blog.mail', { mail: { apiKey: wrongKeyCiphertext } })
    const before = await readData('blog.mail')

    await expect(migrateSecretsEncryption(db)).rejects.toThrow(/Secrets encryption migration aborted/)

    expect(await readData('blog.mail')).toEqual(before)
  })
})
