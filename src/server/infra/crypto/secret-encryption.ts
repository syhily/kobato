import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { createDecipheriv, createHash, createCipheriv, randomBytes } from 'node:crypto'

import { SECRET_FIELDS } from '@/server/domains/settings/secrets'
import { SECTION_REGISTRY } from '@/server/domains/settings/sections'
import { findSettingsByScopePrefix, upsertSetting } from '@/server/infra/db/operations/setting'
import { ENCRYPTION_KEY, isVitest } from '@/server/infra/env'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('crypto')

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
// Each encrypted value is stored as `enc:iv:authTag:ciphertext`, all hex-encoded.
const ENCRYPTED_PREFIX = 'enc:'

// Lazy-derived key: computed once on first use, then cached.
let cachedKey: Buffer | undefined

function getKey(): Buffer {
  if (cachedKey !== undefined) {
    return cachedKey
  }
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY env var is required for secret encryption')
  }
  cachedKey = createHash('sha256').update(ENCRYPTION_KEY).digest()
  return cachedKey
}

function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${ENCRYPTED_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

function decrypt(ciphertext: string): string {
  const key = getKey()
  const parts = ciphertext.slice(ENCRYPTED_PREFIX.length).split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted secret format')
  }
  const iv = Buffer.from(parts[0], 'hex')
  const authTag = Buffer.from(parts[1], 'hex')
  const encrypted = Buffer.from(parts[2], 'hex')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

function isEncrypted(value: string): boolean {
  if (!value.startsWith(ENCRYPTED_PREFIX)) {
    return false
  }
  const parts = value.slice(ENCRYPTED_PREFIX.length).split(':')
  return parts.length === 3 && parts.every((p) => p.length > 0 && /^[0-9a-f]+$/i.test(p))
}

let warnedMissingKey = false

export function encryptIfNeeded(plaintext: string): string {
  if (!ENCRYPTION_KEY) {
    if (!warnedMissingKey) {
      log.warn('ENCRYPTION_KEY not set — secrets will be stored as plaintext in the database')
      warnedMissingKey = true
    }
    return plaintext
  }
  if (isEncrypted(plaintext) || plaintext === '') {
    return plaintext
  }
  return encrypt(plaintext)
}

export function decryptIfNeeded(ciphertext: string): string {
  if (!isEncrypted(ciphertext)) {
    return ciphertext
  }
  try {
    return decrypt(ciphertext)
  } catch (error) {
    log.error('Failed to decrypt secret — encryption key may have changed or ciphertext is corrupted', { error })
    throw new Error('Secret decryption failed', { cause: error })
  }
}

export async function migrateSecretsEncryption(db: NodePgDatabase): Promise<void> {
  if (isVitest()) {
    return
  }

  if (!ENCRYPTION_KEY) {
    log.warn(
      'ENCRYPTION_KEY is not set. API keys and S3 credentials will be stored as plaintext in the database. ' +
        'Set ENCRYPTION_KEY to enable automatic encryption on next startup.',
    )

    // Defensive: if secrets were previously encrypted, the app will fail
    // at runtime when decryptIfNeeded is called.  Scan and warn so the
    // operator sees the problem at startup rather than at request time.
    const rows = await findSettingsByScopePrefix(db, 'blog.')
    const byScope = new Map(rows.map((r) => [r.scope, r.data as Record<string, unknown>]))
    let encryptedCount = 0
    for (const { section, path, field } of SECRET_FIELDS) {
      const scope = SECTION_REGISTRY[section].scope
      const bucket = byScope.get(scope)?.[path] as Record<string, unknown> | undefined
      const value = bucket?.[field]
      if (typeof value === 'string' && isEncrypted(value)) {
        encryptedCount++
      }
    }
    if (encryptedCount > 0) {
      log.error(
        `${encryptedCount} encrypted secret(s) found in the database but ENCRYPTION_KEY is not set. ` +
          'The app will crash at runtime when these secrets are read. ' +
          'Restore the key or clear the secrets from the database.',
      )
    }
    return
  }

  try {
    const rows = await findSettingsByScopePrefix(db, 'blog.')
    const byScope = new Map(rows.map((r) => [r.scope, r.data as Record<string, unknown>]))

    let encrypted = 0
    let verified = 0
    const dirtyScopes = new Set<string>()
    const failures: string[] = []

    for (const { section, path, field } of SECRET_FIELDS) {
      const scope = SECTION_REGISTRY[section].scope
      const data = byScope.get(scope)
      if (!data) {
        continue
      }

      const bucket = data[path] as Record<string, unknown> | undefined
      if (!bucket) {
        continue
      }

      const value = bucket[field]
      if (typeof value !== 'string' || value === '') {
        continue
      }

      if (isEncrypted(value)) {
        try {
          decrypt(value)
          verified++
        } catch (error) {
          const msg = `[${scope}] ${path}.${field} failed to decrypt — ENCRYPTION_KEY may be incorrect or ciphertext is corrupted`
          log.error(msg, { error })
          failures.push(msg)
        }
      } else {
        try {
          bucket[field] = encrypt(value)
          dirtyScopes.add(scope)
          encrypted++
        } catch (error) {
          const msg = `[${scope}] ${path}.${field} failed to encrypt`
          log.error(msg, { error })
          failures.push(msg)
        }
      }
    }

    for (const scope of dirtyScopes) {
      await upsertSetting(db, byScope.get(scope)!, null, scope)
    }

    if (failures.length > 0) {
      throw new Error(
        `Secrets encryption migration aborted — ${failures.length} secret(s) failed. ` +
          'Ensure ENCRYPTION_KEY is correct and secrets are not corrupted.',
      )
    }

    if (encrypted > 0 || verified > 0) {
      log.info(`Secrets migration complete: ${encrypted} encrypted, ${verified} verified`)
    }
  } catch (error) {
    log.error('Secrets encryption migration failed', { error })
    throw error
  }
}
