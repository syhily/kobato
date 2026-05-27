import { createDecipheriv, createHash, createCipheriv, randomBytes } from 'node:crypto'

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

export function emitEncryptionStartupWarning(): void {
  if (isVitest() || ENCRYPTION_KEY) {
    return
  }
  log.warn(
    'ENCRYPTION_KEY is not set. API keys and S3 credentials will be stored as plaintext in the database. ' +
      'Set ENCRYPTION_KEY and run `npx tsx scripts/encrypt-settings-secrets.ts` to encrypt existing secrets.',
  )
}
