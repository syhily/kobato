import { createDecipheriv, createHash, createCipheriv, hkdfSync, randomBytes } from 'node:crypto'

import { ENCRYPTION_KEY } from '@/server/infra/env'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('crypto')

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const ENCRYPTED_PREFIX = 'enc:'
const ENCRYPTED_V2_PREFIX = 'enc2:'

const HKDF_SALT = Buffer.from('kobato-secret-v2-salt')
const HKDF_INFO = 'aes-256-gcm-key'

let cachedLegacyKey: Buffer | undefined
let cachedKey: Buffer | undefined

function getLegacyKey(): Buffer {
  if (cachedLegacyKey !== undefined) {
    return cachedLegacyKey
  }
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY env var is required for secret encryption')
  }
  cachedLegacyKey = createHash('sha256').update(ENCRYPTION_KEY).digest()
  return cachedLegacyKey
}

function getKey(): Buffer {
  if (cachedKey !== undefined) {
    return cachedKey
  }
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY env var is required for secret encryption')
  }
  cachedKey = Buffer.from(hkdfSync('sha256', ENCRYPTION_KEY, HKDF_SALT, HKDF_INFO, 32))
  return cachedKey
}

function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${ENCRYPTED_V2_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

function decrypt(ciphertext: string): string {
  const isV2 = ciphertext.startsWith(ENCRYPTED_V2_PREFIX)
  const prefix = isV2 ? ENCRYPTED_V2_PREFIX : ENCRYPTED_PREFIX
  const key = isV2 ? getKey() : getLegacyKey()
  const parts = ciphertext.slice(prefix.length).split(':')
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

export function isEncrypted(value: string): boolean {
  if (!value.startsWith(ENCRYPTED_PREFIX) && !value.startsWith(ENCRYPTED_V2_PREFIX)) {
    return false
  }
  const prefix = value.startsWith(ENCRYPTED_V2_PREFIX) ? ENCRYPTED_V2_PREFIX : ENCRYPTED_PREFIX
  const parts = value.slice(prefix.length).split(':')
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
