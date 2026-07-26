import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import type { ClearCacheTarget } from '@/shared/types/cache'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { clearAllTables } from '#/_helpers/integration-db'
import { setBlogSettingsBundleForTests } from '@/server/domains/settings/services/test-utils'
import { clearAdminCache, getAdminCacheStats } from '@/server/infra/cache/admin-ops'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { kvCache } from '@/server/infra/db/schema/kv-cache'
import { session } from '@/server/infra/db/schema/session'

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

async function seedKvRow(key: string, bucket: string, opts: { expired?: boolean } = {}): Promise<void> {
  await db.insert(kvCache).values({
    key,
    bucket,
    blob: Buffer.from([1]),
    expiresAt: opts.expired ? new Date(Date.now() - 1000) : new Date(Date.now() + 3_600_000),
  })
}

async function remainingKvKeys(): Promise<string[]> {
  const rows = await db.select({ key: kvCache.key }).from(kvCache).orderBy(kvCache.key)
  return rows.map((row) => row.key)
}

describe('service: cache admin', () => {
  beforeEach(async () => {
    // Truncate kv_cache (and everything else) so no leftover rows from
    // other tests pollute the bucket counts.
    await clearAllTables(db)
    setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  })

  it('counts rows per bucket column', async () => {
    await seedKvRow('og:hello-deadbeef', 'og')
    await seedKvRow('og:world-cafef00d', 'og')
    await seedKvRow('avatar:abc', 'avatar')
    await seedKvRow('calendar:2026-04-30', 'calendar')
    await seedKvRow('feed:xml:all', 'feed')
    // Out-of-bucket noise — must NOT show up.
    await seedKvRow('legacy:misc', 'misc')

    const stats = await getAdminCacheStats(db)

    const counts = Object.fromEntries(stats.buckets.map((bucket) => [bucket.id, bucket.keyCount]))
    expect(counts).toEqual({
      og: 2,
      avatar: 1,
      calendar: 1,
      imageMeta: 0,
      embeddingSearch: 0,
      searchResult: 0,
      feed: 1,
      sitemap: 0,
      categories: 0,
      tags: 0,
      comments: 0,
    })
    expect(stats.total).toBe(5)
  })

  it('does not count expired rows but still clears them', async () => {
    await seedKvRow('og:live', 'og')
    await seedKvRow('og:expired', 'og', { expired: true })

    const stats = await getAdminCacheStats(db)
    expect(stats.buckets.find((bucket) => bucket.id === 'og')?.keyCount).toBe(1)

    const result = await clearAdminCache(db, 'og')
    expect(result.total).toBe(2)
    expect(await remainingKvKeys()).toEqual([])
  })

  it('clears only the targeted bucket', async () => {
    await seedKvRow('og:hello-deadbeef', 'og')
    await seedKvRow('og:world-cafef00d', 'og')
    await seedKvRow('avatar:abc', 'avatar')
    await seedKvRow('legacy:misc', 'misc')

    const result = await clearAdminCache(db, 'og')

    expect(result.cleared).toEqual([{ bucketId: 'og', label: 'OG 图缓存', removed: 2 }])
    expect(result.total).toBe(2)
    expect(await remainingKvKeys()).toEqual(['avatar:abc', 'legacy:misc'])
  })

  it('aggregates counts when clearing all buckets', async () => {
    await seedKvRow('og:hello-deadbeef', 'og')
    await seedKvRow('avatar:abc', 'avatar')
    await seedKvRow('avatar:def', 'avatar')
    await seedKvRow('calendar:2026-04-30', 'calendar')
    await db.insert(session).values({
      id: 'session-1',
      data: {},
      expiresAt: new Date(Date.now() + 3_600_000),
    })

    const result = await clearAdminCache(db, 'all')

    expect(result.total).toBe(4)
    const cleared = Object.fromEntries(result.cleared.map((entry) => [entry.bucketId, entry.removed]))
    expect(cleared).toEqual({
      og: 1,
      avatar: 2,
      calendar: 1,
      imageMeta: 0,
      embeddingSearch: 0,
      searchResult: 0,
      feed: 0,
      sitemap: 0,
      categories: 0,
      tags: 0,
      comments: 0,
    })
    expect(await remainingKvKeys()).toEqual([])
    // Sessions are a reserved bucket: never cleared, still reported.
    expect(result.refreshedStats.reserved.find((bucket) => bucket.id === 'session')?.keyCount).toBe(1)
  })

  it('reports live session rows in the reserved bucket stats', async () => {
    await db.insert(session).values([
      { id: 'session-live', data: {}, expiresAt: new Date(Date.now() + 3_600_000) },
      { id: 'session-expired', data: {}, expiresAt: new Date(Date.now() - 1000) },
    ])

    const stats = await getAdminCacheStats(db)
    const sessionBucket = stats.reserved.find((bucket) => bucket.id === 'session')
    expect(sessionBucket?.keyCount).toBe(1)
  })

  it('rejects unknown bucket targets with DomainError', async () => {
    await expect(clearAdminCache(db, 'nope' as unknown as ClearCacheTarget)).rejects.toThrow('未知的缓存分组')
  })

  it('returns 0 deletions when the bucket is already empty', async () => {
    const result = await clearAdminCache(db, 'og')
    expect(result.total).toBe(0)
    expect(result.cleared[0]?.removed).toBe(0)
  })

  it('surfaces a renamed prefix on the stats entry while the bucket column stays authoritative', async () => {
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

    await seedKvRow('opengraph:fresh-deadbeef', 'og')
    await seedKvRow('og:stale-deadbeef', 'og') // legacy key under the old prefix, same bucket label
    await seedKvRow('avatar:abc', 'avatar')

    const stats = await getAdminCacheStats(db)
    expect(stats.buckets.find((bucket) => bucket.id === 'og')?.pattern).toBe('opengraph:*')
    // Both rows carry the `og` bucket label — counting follows the column,
    // not the key prefix, so a rename no longer orphans old entries.
    expect(stats.buckets.find((bucket) => bucket.id === 'og')?.keyCount).toBe(2)

    const cleared = await clearAdminCache(db, 'og')
    expect(cleared.total).toBe(2)
    expect(await remainingKvKeys()).toEqual(['avatar:abc'])
  })

  it('exposes prefix + TTL on every stats entry', async () => {
    await seedKvRow('og:hello-x', 'og')
    const stats = await getAdminCacheStats(db)

    const og = stats.buckets.find((bucket) => bucket.id === 'og')
    const cacheFixture = TEST_BLOG_SETTINGS_BUNDLE.cache!.cache
    expect(og?.prefix).toBe(cacheFixture.og.prefix)
    expect(og?.ttlSeconds).toBe(cacheFixture.og.ttlSeconds)
    expect(og?.pattern).toBe(`${cacheFixture.og.prefix}*`)
  })

  it('counts and clears the imageMeta bucket the same way as og/avatar/calendar', async () => {
    await seedKvRow('image-meta:images/2024/06/cover.jpg', 'imageMeta')
    await seedKvRow('image-meta:images/2024/06/banner.jpg', 'imageMeta')
    await seedKvRow('og:foo', 'og')

    const stats = await getAdminCacheStats(db)
    const counts = Object.fromEntries(stats.buckets.map((b) => [b.id, b.keyCount]))
    expect(counts.imageMeta).toBe(2)

    const result = await clearAdminCache(db, 'imageMeta')
    expect(result.total).toBe(2)
    expect(result.cleared[0]?.bucketId).toBe('imageMeta')
    // og rows survive a targeted imageMeta sweep.
    expect(await remainingKvKeys()).toEqual(['og:foo'])
  })
})
