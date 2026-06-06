import { beforeEach, describe, expect, it } from 'vitest'

import type { ClearCacheTarget } from '@/shared/types/cache'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { flushWorkerRedis } from '#/_helpers/redis'
import { setBlogSettingsBundleForTests } from '@/server/domains/settings/snapshot'
import { clearAdminCache, getAdminCacheStats } from '@/server/infra/redis/admin-ops'
import { redisInstance, storage } from '@/server/infra/redis/storage'

async function remainingOwnKeys(ownKeys: string[]): Promise<string[]> {
  // Use storage.getKeys so the returned key names are stripped of any
  // global Redis prefix, matching the plain names in ownKeys.
  const all = await storage.getKeys()
  return all.filter((k) => ownKeys.includes(k)).sort()
}

describe('service: cache admin', () => {
  // Track keys created by each test so we can filter `redis.keys('*')`
  // to only our own keys — parallel workers may write keys that would
  // otherwise pollute exact-list assertions.
  let ownKeys: string[]

  beforeEach(async () => {
    ownKeys = []
    // Flush the current worker's Redis keys so no leftover keys from
    // other tests pollute the SCAN counts.
    await flushWorkerRedis()
    setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  })

  it('counts keys per bucket via SCAN', async () => {
    const redis = redisInstance()
    await redis.set('og:hello-deadbeef', Buffer.from([1, 2]))
    await redis.set('og:world-cafef00d', Buffer.from([3, 4]))
    await redis.set('avatar:abc', Buffer.from([5]))
    await redis.set('calendar:2026-04-30', Buffer.from([6]))
    // Out-of-bucket noise — must NOT show up.
    await redis.set('session:xyz', 'cookie-payload')
    await redis.set('rate-limit:1.2.3.4', '4')

    const stats = await getAdminCacheStats()

    const counts = Object.fromEntries(stats.buckets.map((bucket) => [bucket.id, bucket.keyCount]))
    expect(counts).toEqual({
      og: 2,
      avatar: 1,
      calendar: 1,
      imageMeta: 0,
      embeddingSearch: 0,
      searchResult: 0,
    })
    expect(stats.total).toBe(4)
  })

  it('clears only the targeted bucket', async () => {
    const redis = redisInstance()
    ownKeys = ['og:hello-deadbeef', 'og:world-cafef00d', 'avatar:abc', 'session:xyz']
    await redis.set('og:hello-deadbeef', Buffer.from([1]))
    await redis.set('og:world-cafef00d', Buffer.from([2]))
    await redis.set('avatar:abc', Buffer.from([3]))
    await redis.set('session:xyz', 'cookie-payload')

    const result = await clearAdminCache('og')

    expect(result.cleared).toEqual([{ bucketId: 'og', label: 'OG 图缓存', removed: 2 }])
    expect(result.total).toBe(2)

    const remaining = await remainingOwnKeys(ownKeys)
    expect(remaining).toEqual(['avatar:abc', 'session:xyz'])
  })

  it('aggregates counts when clearing all buckets', async () => {
    const redis = redisInstance()
    ownKeys = ['og:hello-deadbeef', 'avatar:abc', 'avatar:def', 'calendar:2026-04-30', 'session:xyz']
    await redis.set('og:hello-deadbeef', Buffer.from([1]))
    await redis.set('avatar:abc', Buffer.from([2]))
    await redis.set('avatar:def', Buffer.from([3]))
    await redis.set('calendar:2026-04-30', Buffer.from([4]))
    await redis.set('session:xyz', 'cookie-payload')

    const result = await clearAdminCache('all')

    expect(result.total).toBe(4)
    const cleared = Object.fromEntries(result.cleared.map((entry) => [entry.bucketId, entry.removed]))
    expect(cleared).toEqual({
      og: 1,
      avatar: 2,
      calendar: 1,
      imageMeta: 0,
      embeddingSearch: 0,
      searchResult: 0,
    })
    // Out-of-bucket keys survive a "全部清空".
    const remaining = await remainingOwnKeys(ownKeys)
    expect(remaining).toEqual(['session:xyz'])
  })

  it('rejects unknown bucket targets with DomainError', async () => {
    await expect(clearAdminCache('nope' as unknown as ClearCacheTarget)).rejects.toThrow('未知的缓存分组')
  })

  it('returns 0 deletions when the bucket is already empty', async () => {
    const result = await clearAdminCache('og')
    expect(result.total).toBe(0)
    expect(result.cleared[0]?.removed).toBe(0)
  })

  it('honors a renamed prefix from the live snapshot', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      cache: {
        cache: {
          ...TEST_BLOG_SETTINGS_BUNDLE.cache!.cache,
          og: {
            prefix: 'opengraph:',
            ttlSeconds: TEST_BLOG_SETTINGS_BUNDLE.cache!.cache.og.ttlSeconds,
          },
        },
      },
    })

    const redis = redisInstance()
    ownKeys = ['opengraph:fresh-deadbeef', 'og:stale-deadbeef', 'avatar:abc']
    await redis.set('opengraph:fresh-deadbeef', Buffer.from([1]))
    await redis.set('og:stale-deadbeef', Buffer.from([2])) // legacy key under the old prefix
    await redis.set('avatar:abc', Buffer.from([3]))

    const stats = await getAdminCacheStats()
    expect(stats.buckets.find((bucket) => bucket.id === 'og')?.pattern).toBe('opengraph:*')
    expect(stats.buckets.find((bucket) => bucket.id === 'og')?.keyCount).toBe(1)

    const cleared = await clearAdminCache('og')
    expect(cleared.total).toBe(1)
    // Legacy `og:stale-…` key is NOT touched.
    const remaining = await remainingOwnKeys(ownKeys)
    expect(remaining).toEqual(['avatar:abc', 'og:stale-deadbeef'])
  })

  it('exposes prefix + TTL on every stats entry', async () => {
    const redis = redisInstance()
    await redis.set('og:hello-x', Buffer.from([1]))
    const stats = await getAdminCacheStats()

    const og = stats.buckets.find((bucket) => bucket.id === 'og')
    const cacheFixture = TEST_BLOG_SETTINGS_BUNDLE.cache!.cache
    expect(og?.prefix).toBe(cacheFixture.og.prefix)
    expect(og?.ttlSeconds).toBe(cacheFixture.og.ttlSeconds)
    expect(og?.pattern).toBe(`${cacheFixture.og.prefix}*`)
  })

  it('scans and clears the imageMeta buckets the same way as og/avatar/calendar', async () => {
    const redis = redisInstance()
    ownKeys = ['image-meta:images/2024/06/cover.jpg', 'image-meta:images/2024/06/banner.jpg', 'og:foo']
    await redis.set('image-meta:images/2024/06/cover.jpg', JSON.stringify({ found: true }))
    await redis.set('image-meta:images/2024/06/banner.jpg', JSON.stringify({ found: false }))
    await redis.set('og:foo', Buffer.from([1]))

    const stats = await getAdminCacheStats()
    const counts = Object.fromEntries(stats.buckets.map((b) => [b.id, b.keyCount]))
    expect(counts.imageMeta).toBe(2)

    const result = await clearAdminCache('imageMeta')
    expect(result.total).toBe(2)
    expect(result.cleared[0]?.bucketId).toBe('imageMeta')
    // og keys survive a targeted imageMeta sweep.
    const remaining = await remainingOwnKeys(ownKeys)
    expect(remaining).toEqual(['og:foo'])
  })
})
