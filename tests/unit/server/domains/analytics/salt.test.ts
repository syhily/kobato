import { describe, expect, it } from 'vitest'

import { getDailySalt } from '@/server/domains/analytics/salt'

describe('server/domains/analytics/salt — getDailySalt', () => {
  it('returns a non-empty hex string', () => {
    const salt = getDailySalt()
    expect(salt.length).toBeGreaterThan(0)
    expect(salt).toMatch(/^[0-9a-f]+$/)
  })

  it('is stable across calls within the same process tick (same UTC day)', () => {
    expect(getDailySalt()).toBe(getDailySalt())
  })

  it('produces a 64-char salt from 32 random bytes', () => {
    expect(getDailySalt().length).toBe(64)
  })
})
