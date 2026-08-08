import { describe, expect, it } from 'vitest'

import { makeToken } from '@/shared/utils/security'

// makeToken feeds like-tokens and CSRF tokens; the base64url alphabet keeps tokens URL-embeddable.

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/

describe('shared/security — makeToken', () => {
  it('returns a string of exactly the requested length', () => {
    for (const length of [1, 16, 24, 32, 48, 64, 96, 128]) {
      const token = makeToken(length)
      expect(token).toHaveLength(length)
    }
  })

  it('only uses base64url characters (urlsafe alphabet, no padding)', () => {
    for (let i = 0; i < 64; i++) {
      const token = makeToken(64)
      expect(token).toMatch(BASE64URL_RE)
    }
  })

  it('returns the empty string for zero-length requests', () => {
    expect(makeToken(0)).toBe('')
  })

  it('never collides across 1024 fresh draws of 32-char tokens', () => {
    const draws = new Set<string>()
    for (let i = 0; i < 1024; i++) {
      draws.add(makeToken(32))
    }
    expect(draws.size).toBe(1024)
  })
})
