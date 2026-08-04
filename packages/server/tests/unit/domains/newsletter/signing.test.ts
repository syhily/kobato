import { signUnsubscribeId, verifyUnsubscribeSignature } from '@kobato/server/domains/newsletter/signing'
import { describe, expect, it } from 'vitest'

describe('newsletter/signing', () => {
  it('round-trips a subscriber id signature', () => {
    const sig = signUnsubscribeId(42)
    expect(sig).toMatch(/^[0-9a-f]{64}$/)
    expect(verifyUnsubscribeSignature(42, sig)).toBe(true)
  })

  it('rejects the signature for a different id', () => {
    const sig = signUnsubscribeId(42)
    expect(verifyUnsubscribeSignature(43, sig)).toBe(false)
  })

  it('rejects malformed signatures without throwing', () => {
    expect(verifyUnsubscribeSignature(42, '')).toBe(false)
    expect(verifyUnsubscribeSignature(42, 'not-hex')).toBe(false)
    expect(verifyUnsubscribeSignature(42, 'ab12')).toBe(false)
    expect(verifyUnsubscribeSignature(42, 'Z'.repeat(64))).toBe(false)
  })
})
