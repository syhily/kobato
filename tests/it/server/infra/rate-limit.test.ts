import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import {
  rateLimitEntryCount,
  tryCommentPostRateLimit,
  tryCommentPostRateLimitByEmail,
  tryLikeIncreaseRateLimit,
  tryRateLimit,
  __resetRateLimitsForTests,
} from '@/server/infra/rate-limit'

// Pure in-process counter map: fake timers drive windows; the test-only seam resets it between cases.
const T0 = new Date('2026-01-01T00:00:00.000Z').getTime()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  __resetRateLimitsForTests()
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('server/rate-limit — config-driven thresholds', () => {
  it('uses the active settings snapshot for windowSeconds + maxAttempts', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      rateLimit: {
        ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit!,
        likeIncreaseIp: { windowSeconds: 120, maxAttempts: 2 },
      },
    })

    const first = await tryLikeIncreaseRateLimit('1.2.3.4')
    const second = await tryLikeIncreaseRateLimit('1.2.3.4')
    const third = await tryLikeIncreaseRateLimit('1.2.3.4')

    expect(first).toEqual({ count: 1, exceeded: false })
    expect(second).toEqual({ count: 2, exceeded: false })
    expect(third).toEqual({ count: 3, exceeded: true })

    vi.setSystemTime(T0 + 119_000)
    expect((await tryLikeIncreaseRateLimit('1.2.3.4')).count).toBe(4)
    vi.setSystemTime(T0 + 121_000)
    expect((await tryLikeIncreaseRateLimit('1.2.3.4')).count).toBe(1)
  })

  it('hot-reloads when the admin saves a new policy mid-process', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      rateLimit: {
        ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit!,
        signInIp: { windowSeconds: 60, maxAttempts: 3 },
      },
    })
    expect((await tryRateLimit('5.5.5.5')).exceeded).toBe(false)
    expect((await tryRateLimit('5.5.5.5')).exceeded).toBe(false)
    expect((await tryRateLimit('5.5.5.5')).exceeded).toBe(false)
    expect((await tryRateLimit('5.5.5.5')).exceeded).toBe(true)

    // The snapshot is read synchronously — the tightened cap applies at once.
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      rateLimit: {
        ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit!,
        signInIp: { windowSeconds: 60, maxAttempts: 1 },
      },
    })
    // Counter for `5.5.5.5` is already at 4 — over the new cap of 1.
    expect((await tryRateLimit('5.5.5.5')).exceeded).toBe(true)
    // Only `count > maxAttempts` trips the limit — a fresh IP's first hit (count 1) sits at the cap.
    expect((await tryRateLimit('9.9.9.9')).exceeded).toBe(false)
    expect((await tryRateLimit('9.9.9.9')).exceeded).toBe(true)
  })

  it('falls back to the historical defaults when the snapshot is null (pre-install)', async () => {
    setBlogSettingsBundleForTests(null)

    // Default sign-in cap is 5.
    for (let i = 0; i < 5; i += 1) {
      expect((await tryRateLimit('7.7.7.7')).exceeded).toBe(false)
    }
    expect((await tryRateLimit('7.7.7.7')).exceeded).toBe(true)
  })

  it('isolates buckets so the four surfaces never share a counter', async () => {
    await tryRateLimit('11.11.11.11')
    await tryCommentPostRateLimit('11.11.11.11')
    await tryCommentPostRateLimitByEmail('alice@example.com')
    await tryLikeIncreaseRateLimit('11.11.11.11')

    expect(rateLimitEntryCount()).toBe(4)
    expect((await tryRateLimit('11.11.11.11')).count).toBe(2)
    expect((await tryCommentPostRateLimit('11.11.11.11')).count).toBe(2)
    expect((await tryCommentPostRateLimitByEmail('alice@example.com')).count).toBe(2)
    expect((await tryLikeIncreaseRateLimit('11.11.11.11')).count).toBe(2)
  })
})
