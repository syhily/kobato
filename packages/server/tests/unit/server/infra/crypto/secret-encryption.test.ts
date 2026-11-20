import { afterEach, describe, expect, it, vi } from 'vitest'

const MOCK_KEY = 'a1b2c3d4e5f6g7h8i9j0a1b2c3d4e5f6'

function importModule(key: string | undefined) {
  if (key === undefined) {
    vi.unstubAllEnvs()
  } else {
    vi.stubEnv('security__encryptionKey', key)
  }
  vi.resetModules()
  return import('@kobato/server/infra/crypto/secret-encryption.ts')
}

function clean() {
  vi.unstubAllEnvs()
  vi.resetModules()
}

describe('secret-encryption', () => {
  afterEach(clean)

  describe('isEncrypted', () => {
    it('recognises enc: prefixed values', async () => {
      const { isEncrypted } = await importModule(MOCK_KEY)
      expect(isEncrypted('enc:aabbccdd:11223344:aabb')).toBe(true)
    })

    it('recognises enc2: prefixed values', async () => {
      const { isEncrypted } = await importModule(MOCK_KEY)
      expect(isEncrypted('enc2:aabbccdd:11223344:aabb')).toBe(true)
    })

    it('rejects plain text', async () => {
      const { isEncrypted } = await importModule(MOCK_KEY)
      expect(isEncrypted('hello')).toBe(false)
    })

    it('rejects empty string', async () => {
      const { isEncrypted } = await importModule(MOCK_KEY)
      expect(isEncrypted('')).toBe(false)
    })

    it('rejects prefix with wrong number of parts', async () => {
      const { isEncrypted } = await importModule(MOCK_KEY)
      expect(isEncrypted('enc:aabb:cc')).toBe(false)
      expect(isEncrypted('enc:aabb:cc:dd:ee')).toBe(false)
    })

    it('rejects prefix with non-hex parts', async () => {
      const { isEncrypted } = await importModule(MOCK_KEY)
      expect(isEncrypted('enc:zzzz:1122:aabb')).toBe(false)
    })

    it('rejects prefix with empty parts', async () => {
      const { isEncrypted } = await importModule(MOCK_KEY)
      expect(isEncrypted('enc::1122:aabb')).toBe(false)
      expect(isEncrypted('enc:aabb::aabb')).toBe(false)
    })
  })

  describe('encryptIfNeeded / decryptIfNeeded roundtrip', () => {
    it('encrypts plaintext and decrypts back to original', async () => {
      const { encryptIfNeeded, decryptIfNeeded } = await importModule(MOCK_KEY)
      const original = 'my-secret-api-key'
      const encrypted = encryptIfNeeded(original)
      expect(encrypted).not.toBe(original)
      expect(encrypted.startsWith('enc2:')).toBe(true)
      expect(decryptIfNeeded(encrypted)).toBe(original)
    })

    it('does not double-encrypt already encrypted values', async () => {
      const { encryptIfNeeded } = await importModule(MOCK_KEY)
      const encrypted = encryptIfNeeded('secret')
      const again = encryptIfNeeded(encrypted)
      expect(again).toBe(encrypted)
    })

    it('returns empty string as-is', async () => {
      const { encryptIfNeeded } = await importModule(MOCK_KEY)
      expect(encryptIfNeeded('')).toBe('')
    })

    it('decryptIfNeeded returns non-encrypted values unchanged', async () => {
      const { decryptIfNeeded } = await importModule(MOCK_KEY)
      expect(decryptIfNeeded('not-encrypted')).toBe('not-encrypted')
    })

    it('decryptIfNeeded throws on corrupted ciphertext', async () => {
      const { decryptIfNeeded } = await importModule(MOCK_KEY)
      // Valid format but garbage bytes — AES-GCM auth tag check should fail
      const fake = 'enc2:' + '00'.repeat(12) + ':' + '00'.repeat(16) + ':' + '00'.repeat(16)
      expect(() => decryptIfNeeded(fake)).toThrow('Secret decryption failed')
    })

    it('the decryption error names the encryption key and the backup-restore remedy', async () => {
      const { decryptIfNeeded } = await importModule(MOCK_KEY)
      const fake = 'enc2:' + '00'.repeat(12) + ':' + '00'.repeat(16) + ':' + '00'.repeat(16)
      expect(() => decryptIfNeeded(fake)).toThrow(/security\.encryptionKey/)
      expect(() => decryptIfNeeded(fake)).toThrow(/restoring a backup/)
    })
  })

  describe('secretHmac', () => {
    it('is deterministic and purpose-scoped', async () => {
      const { secretHmac } = await importModule(MOCK_KEY)
      expect(secretHmac('observability', 'payload')).toBe(secretHmac('observability', 'payload'))
      expect(secretHmac('observability', 'payload')).not.toBe(secretHmac('other-purpose', 'payload'))
      expect(secretHmac('observability', 'payload')).toMatch(/^[0-9a-f]{64}$/)
    })

    it('derives its key from the deployment encryption key', async () => {
      const first = (await importModule(MOCK_KEY)).secretHmac('observability', 'payload')
      clean()
      const rotated = (await importModule('b1c2d3e4f5g6h7i8j9k0b1c2d3e4f5g6h')).secretHmac('observability', 'payload')
      expect(rotated).not.toBe(first)
    })
  })

  describe('v2 format produces enc2: prefix', () => {
    it('uses enc2: prefix for new encryptions', async () => {
      const { encryptIfNeeded, isEncrypted } = await importModule(MOCK_KEY)
      const result = encryptIfNeeded('test-value')
      expect(result.startsWith('enc2:')).toBe(true)
      expect(isEncrypted(result)).toBe(true)
    })
  })
})
