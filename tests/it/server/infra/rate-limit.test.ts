// `expect((await fn()).field)` is the compact assertion idiom we use
// throughout the suite. Extracting an intermediate variable on every
// line would double the file length without adding clarity.
// oxlint-disable unicorn/no-await-expression-member

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import {
  rateLimitEntryCount,
  tryCommentPostRateLimit,
  tryCommentPostRateLimitByEmail,
  tryLikeIncreaseRateLimit,
  tryRateLimit,
  __resetRateLimitsForTests,
} from '@/server/infra/rate-limit'

// The limiter is a pure in-process counter map — no external store, no
// DB — so window boundaries are driven with fake timers and the map is
// reset between cases via the test-only seam.
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

    // The configured 120s window anchors at the first hit: 119s later
    // the counter still climbs; 121s later a fresh window starts.
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

    // Admin tightens the cap to 1; the very next call sees the new
    // policy because the module reads the snapshot synchronously.
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      rateLimit: {
        ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit!,
        signInIp: { windowSeconds: 60, maxAttempts: 1 },
      },
    })
    // Counter for `5.5.5.5` is already at 4 from the previous calls,
    // so any further attempt is over the new cap of 1.
    expect((await tryRateLimit('5.5.5.5')).exceeded).toBe(true)
    // A previously-unseen IP starts at 1 → still > new cap of 1? No,
    // the post-increment counter is exactly 1 which equals
    // maxAttempts; only `count > maxAttempts` is treated as exceeded.
    expect((await tryRateLimit('9.9.9.9')).exceeded).toBe(false)
    expect((await tryRateLimit('9.9.9.9')).exceeded).toBe(true)
  })

  it('falls back to the historical defaults when the snapshot is null (pre-install)', async () => {
    setBlogSettingsBundleForTests(null)

    // Default sign-in cap is 5 — first 5 hits stay under, the 6th trips.
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

    // Four independent counters → four live entries; a second hit on
    // any surface bumps only its own counter.
    expect(rateLimitEntryCount()).toBe(4)
    expect((await tryRateLimit('11.11.11.11')).count).toBe(2)
    expect((await tryCommentPostRateLimit('11.11.11.11')).count).toBe(2)
    expect((await tryCommentPostRateLimitByEmail('alice@example.com')).count).toBe(2)
    expect((await tryLikeIncreaseRateLimit('11.11.11.11')).count).toBe(2)
  })
})
