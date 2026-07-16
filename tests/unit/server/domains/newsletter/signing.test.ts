import { describe, expect, it } from 'vitest'

import { signUnsubscribeId, verifyUnsubscribeSignature } from '@/server/domains/newsletter/signing'

describe('newsletter/signing', () => {
  it('round-trips a subscriber id signature', () => {
    const sig = signUnsubscribeId(42n)
    expect(sig).toMatch(/^[0-9a-f]{64}$/)
    expect(verifyUnsubscribeSignature(42n, sig)).toBe(true)
  })

  it('rejects the signature for a different id', () => {
    const sig = signUnsubscribeId(42n)
    expect(verifyUnsubscribeSignature(43n, sig)).toBe(false)
  })

  it('rejects malformed signatures without throwing', () => {
    expect(verifyUnsubscribeSignature(42n, '')).toBe(false)
    expect(verifyUnsubscribeSignature(42n, 'not-hex')).toBe(false)
    expect(verifyUnsubscribeSignature(42n, 'ab12')).toBe(false)
    expect(verifyUnsubscribeSignature(42n, 'Z'.repeat(64))).toBe(false)
  })
})
