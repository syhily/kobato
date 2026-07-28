import { afterEach, describe, expect, it, vi } from 'vitest'

// Must mock before importing the module under test because the encryption
// key is read at module evaluation time.
const MOCK_KEY = 'a'.repeat(32)

function importModule(key: string | undefined) {
  vi.doMock('@/server/infra/config', () => ({
    serverConfig: {
      server: {},
      database: {},
      security: { encryptionKey: key },
      storage: {},
    },
  }))
  vi.doMock('@/server/infra/logger', () => ({
    getLogger: () => ({ warn: vi.fn(), error: vi.fn() }),
  }))
  return import('@/server/infra/crypto/secret-encryption')
}

function clean() {
  vi.doUnmock('@/server/infra/config')
  vi.doUnmock('@/server/infra/logger')
  vi.resetModules()
}

describe('secret-encryption', () => {
  afterEach(clean)

  describe('isEncrypted', () => {
    it('recognises enc: prefixed values', async () => {
      const { isEncrypted } = await importModule(MOCK_KEY)
      // Construct a valid-looking enc: value: iv:authTag:ciphertext (all hex)
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
