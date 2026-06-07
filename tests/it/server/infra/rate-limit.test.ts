// `expect((await fn()).field)` is the compact assertion idiom we use
// throughout the suite. Extracting an intermediate variable on every
// line would double the file length without adding clarity.
// oxlint-disable unicorn/no-await-expression-member

import { beforeEach, describe, expect, it } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { flushWorkerRedis } from '#/_helpers/redis'
import { setBlogSettingsBundleForTests } from '@/server/domains/settings/snapshot'
import {
  tryCommentPostRateLimit,
  tryCommentPostRateLimitByEmail,
  tryLikeIncreaseRateLimit,
  tryRateLimit,
} from '@/server/infra/rate-limit'
import { redisInstance, storage } from '@/server/infra/redis/storage'

beforeEach(async () => {
  await flushWorkerRedis()
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
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

    // First hit armed the EXPIRE NX with the configured window.
    const redis = redisInstance()
    const ttl = await redis.ttl('rate-limit:like-increase:1.2.3.4')
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(120)
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

    const keys = await storage.getKeys('rate-limit:')
    const namespaces = keys.map((key) => key.split(':').slice(0, 2).join(':'))
    expect(new Set(namespaces)).toEqual(
      new Set(['rate-limit:signin', 'rate-limit:comment-post', 'rate-limit:comment-email', 'rate-limit:like-increase']),
    )
    // Email keys must store the hash, not the raw address. The string
    // 'alice@example.com' should never appear verbatim in any key.
    for (const key of keys) {
      expect(key.includes('alice@example.com')).toBe(false)
    }
  })
})
