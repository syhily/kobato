import {
  mintPreviewToken,
  verifyPreviewToken,
  PREVIEW_TOKEN_TTL_SECONDS,
} from '@kobato/server/domains/preview-token/service'
import { describe, expect, it, vi } from 'vitest'

// The preview token is the cross-domain draft-preview credential (plan
// 0.5 §5): role-bound, short-lived, HMAC-signed with the session secret.

describe('preview token service', () => {
  it('round-trips a minted token with the minted role', () => {
    const token = mintPreviewToken('author')
    const claims = verifyPreviewToken(token)
    expect(claims).not.toBeNull()
    expect(claims!.role).toBe('author')
    // Expiry sits inside the TTL window.
    expect(claims!.exp).toBeGreaterThan(Math.floor(Date.now() / 1000))
    expect(claims!.exp).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + PREVIEW_TOKEN_TTL_SECONDS + 1)
  })

  it('rejects a tampered signature', () => {
    const token = mintPreviewToken('admin')
    expect(verifyPreviewToken(`${token}x`)).toBeNull()
    const [payload] = token.split('.')
    expect(verifyPreviewToken(`${payload}.c2lnbmF0dXJl`)).toBeNull()
  })

  it('rejects garbage input', () => {
    expect(verifyPreviewToken('')).toBeNull()
    expect(verifyPreviewToken('no-separator')).toBeNull()
    expect(verifyPreviewToken('.signature-only')).toBeNull()
    expect(verifyPreviewToken('payload.')).toBeNull()
  })

  it('rejects an expired token', async () => {
    vi.useFakeTimers()
    try {
      const token = mintPreviewToken('author')
      vi.setSystemTime(Date.now() + (PREVIEW_TOKEN_TTL_SECONDS + 60) * 1000)
      expect(verifyPreviewToken(token)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
