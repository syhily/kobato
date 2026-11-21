import { generateToken, sha256, TOKEN_LEN_RE } from '@kobato/server/infra/crypto/tokens'
import { describe, expect, it } from 'vitest'

describe('infra/crypto/tokens', () => {
  describe('generateToken', () => {
    it('produces a 43-char base64url token matching TOKEN_LEN_RE', () => {
      const token = generateToken()
      expect(token).toHaveLength(43)
      expect(token).toMatch(TOKEN_LEN_RE)
    })

    it('never repeats a token', () => {
      expect(generateToken()).not.toBe(generateToken())
    })
  })

  describe('TOKEN_LEN_RE', () => {
    it('rejects tokens of the wrong length', () => {
      expect(TOKEN_LEN_RE.test('a'.repeat(42))).toBe(false)
      expect(TOKEN_LEN_RE.test('a'.repeat(44))).toBe(false)
    })

    it('rejects characters outside the base64url alphabet', () => {
      expect(TOKEN_LEN_RE.test(`${'a'.repeat(42)}+`)).toBe(false)
      expect(TOKEN_LEN_RE.test(`${'a'.repeat(42)}=`)).toBe(false)
    })
  })

  describe('sha256', () => {
    it('matches the well-known empty-string digest', () => {
      expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    })

    it('returns 64 lowercase hex chars', () => {
      expect(sha256(generateToken())).toMatch(/^[0-9a-f]{64}$/)
    })
  })
})
