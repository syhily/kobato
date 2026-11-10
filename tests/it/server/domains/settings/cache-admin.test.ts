import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ClearCacheTarget } from '@/shared/types/cache'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { clearAdminCache, getAdminCacheStats } from '@/server/infra/cache/admin-ops'
import { countEntryFiles, readGeneration, resolveCacheRoot, setItem } from '@/server/infra/cache/file-store'
import { bumpCounter, get, getCounter, set, through } from '@/server/infra/cache/registry'
import { session } from '@/server/infra/db/schema/session'

const db = getTestDb()

async function seedEntry(bucket: string, key: string, opts: { expired?: boolean } = {}): Promise<void> {
  await setItem(bucket, key, { seeded: key }, opts.expired ? { ttlSeconds: -1 } : { ttlSeconds: 3600 })
}

/** Actual shard-file sizes — the same population `byteSize` is defined over. */
async function entryFileSizes(bucket: string): Promise<number[]> {
  const bucketDir = path.join(resolveCacheRoot(), bucket)
  const sizes: number[] = []
  let shards
  try {
    shards = await readdir(bucketDir, { withFileTypes: true })
  } catch {
    return sizes
  }
  for (const shard of shards) {
    if (!shard.isDirectory() || !/^[0-9a-f]{2}$/.test(shard.name)) {
      continue
    }
    const shardDir = path.join(bucketDir, shard.name)
    let files
    try {
      files = await readdir(shardDir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const file of files) {
      if (file.isFile()) {
        sizes.push((await stat(path.join(shardDir, file.name))).size)
      }
    }
  }
  return sizes
}

describe('service: cache admin', () => {
  beforeEach(async () => {
    // Wipe the content DB and the filesystem cache so no leftover entries
    // from other tests pollute the bucket counts.
    await clearAllTables(db)
    setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  })

  it('counts live entry files per bucket directory', async () => {
    await seedEntry('og', 'og:hello-deadbeef')
    await seedEntry('og', 'og:world-cafef00d')
    await seedEntry('avatar', 'avatar:abc')
    await seedEntry('calendar', 'calendar:2026-04-30')
    await seedEntry('feed', 'feed:xml:all')
    // Out-of-bucket noise — must NOT show up.
    await seedEntry('misc', 'legacy:misc')

    const stats = await getAdminCacheStats(db)

    const counts = Object.fromEntries(stats.buckets.map((bucket) => [bucket.id, bucket.keyCount]))
    expect(counts).toEqual({
      og: 2,
      avatar: 1,
      calendar: 1,
      imageMeta: 0,
      searchResult: 0,
      feed: 1,
      sitemap: 0,
      categories: 0,
      tags: 0,
      comments: 0,
      githubAvatar: 0,
      githubRelease: 0,
    })
    expect(stats.total).toBe(5)
  })

  it('counts only live keys but sums the bytes of every entry file', async () => {
    await seedEntry('og', 'og:live')
    const liveBytes = (await entryFileSizes('og')).reduce((sum, size) => sum + size, 0)
    await seedEntry('og', 'og:expired', { expired: true })
    const allSizes = await entryFileSizes('og')
    expect(allSizes).toHaveLength(2)

    const og = (await getAdminCacheStats(db)).buckets.find((bucket) => bucket.id === 'og')
    expect(og?.keyCount).toBe(1)
    expect(og?.byteSize).toBe(allSizes.reduce((sum, size) => sum + size, 0))
    expect(og?.byteSize).toBeGreaterThan(liveBytes)

    const result = await clearAdminCache(db, 'og')
    expect(result.total).toBe(2)
    expect(await countEntryFiles('og')).toBe(0)
  })

  it('clears only the targeted bucket', async () => {
    await seedEntry('og', 'og:hello-deadbeef')
    await seedEntry('og', 'og:world-cafef00d')
    await seedEntry('avatar', 'avatar:abc')
    await seedEntry('misc', 'legacy:misc')

    const result = await clearAdminCache(db, 'og')

    expect(result.cleared).toEqual([{ bucketId: 'og', label: 'OG 图缓存', removed: 2 }])
    expect(result.total).toBe(2)
    expect(await countEntryFiles('og')).toBe(0)
    expect(await countEntryFiles('avatar')).toBe(1)
    expect(await countEntryFiles('misc')).toBe(1)
  })

  it('drops the L1 memory tier as part of the admin clear', async () => {
    // `set` writes the file and mirrors L1, so this read never touches disk.
    await set('tags', {}, ['seeded'])
    expect(await get('tags', {})).toEqual(['seeded'])
    expect(await countEntryFiles('tags')).toBe(1)

    const result = await clearAdminCache(db, 'tags')

    expect(result.total).toBe(1)
    expect(await countEntryFiles('tags')).toBe(0)
    // L1 went cold with the clear — the value cannot be resurrected from memory.
    expect(await get('tags', {})).toBeNull()
  })

  it('aggregates counts when clearing all buckets', async () => {
    await seedEntry('og', 'og:hello-deadbeef')
    await seedEntry('avatar', 'avatar:abc')
    await seedEntry('avatar', 'avatar:def')
    await seedEntry('calendar', 'calendar:2026-04-30')
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
      searchResult: 0,
      feed: 0,
      sitemap: 0,
      categories: 0,
      tags: 0,
      comments: 0,
      githubAvatar: 0,
      githubRelease: 0,
    })
    expect(await countEntryFiles('og')).toBe(0)
    expect(await countEntryFiles('avatar')).toBe(0)
    expect(await countEntryFiles('calendar')).toBe(0)
    // Sessions are a reserved bucket: never cleared, still reported.
    expect(result.refreshedStats.reserved.find((bucket) => bucket.id === 'session')?.keyCount).toBe(1)
  })

  it.each([0, 1])(
    'admin-clearing searchResult cannot revive a late loader write (starting generation %i)',
    async (startGeneration) => {
      for (let i = 0; i < startGeneration; i += 1) {
        bumpCounter('searchResult')
      }
      expect(await getCounter('searchResult')).toBe(startGeneration)

      let release!: () => void
      let started!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const loaderStarted = new Promise<void>((resolve) => {
        started = resolve
      })
      const lateParams = { generation: startGeneration, parts: ['late-stale-hash'] }
      const pending = through('searchResult', lateParams, async () => {
        started()
        await gate
        return ['late-value']
      })
      await loaderStarted

      const cleared = await clearAdminCache(db, 'searchResult')
      expect(cleared.cleared[0]?.bucketId).toBe('searchResult')
      expect(cleared.total).toBe(0)

      release()
      await pending

      // The parked loader's fire-and-forget write lands under the OLD
      // generation — proof the race is real, and that it stays unreachable.
      await vi.waitFor(async () => {
        expect(await get('searchResult', lateParams)).toEqual(['late-value'])
      })

      const nextGeneration = await getCounter('searchResult')
      expect(nextGeneration).toBe(startGeneration + 1)
      expect(await readGeneration('searchResult')).toBe(nextGeneration)
      expect(await get('searchResult', { ...lateParams, generation: nextGeneration })).toBeNull()
    },
  )

  it('reports live session rows in the reserved bucket stats', async () => {
    await db.insert(session).values([
      { id: 'session-live', data: {}, expiresAt: new Date(Date.now() + 3_600_000) },
      { id: 'session-expired', data: {}, expiresAt: new Date(Date.now() - 1000) },
    ])

    const stats = await getAdminCacheStats(db)
    const sessionBucket = stats.reserved.find((bucket) => bucket.id === 'session')
    expect(sessionBucket?.keyCount).toBe(1)
  })

  it('rejects unknown bucket targets with a typed descriptor', async () => {
    await expect(clearAdminCache(db, 'nope' as unknown as ClearCacheTarget)).rejects.toMatchObject({
      name: 'DomainError',
      code: 'BAD_REQUEST',
      descriptor: {
        messageKey: 'admin.cache.error.unknownGroup',
        params: { target: 'nope' },
      },
    })
  })

  it('returns 0 deletions when the bucket is already empty', async () => {
    const result = await clearAdminCache(db, 'og')
    expect(result.total).toBe(0)
    expect(result.cleared[0]?.removed).toBe(0)
  })

  it('surfaces a renamed prefix on the stats entry while the bucket directory stays authoritative', async () => {
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

    await seedEntry('og', 'opengraph:fresh-deadbeef')
    await seedEntry('og', 'og:stale-deadbeef') // legacy key under the old prefix, same bucket directory
    await seedEntry('avatar', 'avatar:abc')

    const stats = await getAdminCacheStats(db)
    expect(stats.buckets.find((bucket) => bucket.id === 'og')?.pattern).toBe('opengraph:*')
    // Both entries live in the `og` directory — counting follows the bucket,
    // not the key prefix, so a rename no longer orphans old entries.
    expect(stats.buckets.find((bucket) => bucket.id === 'og')?.keyCount).toBe(2)

    const cleared = await clearAdminCache(db, 'og')
    expect(cleared.total).toBe(2)
    expect(await countEntryFiles('avatar')).toBe(1)
  })

  it('exposes prefix + TTL on every stats entry', async () => {
    await seedEntry('og', 'og:hello-x')
    const stats = await getAdminCacheStats(db)

    const og = stats.buckets.find((bucket) => bucket.id === 'og')
    const cacheFixture = TEST_BLOG_SETTINGS_BUNDLE.cache!.cache
    expect(og?.prefix).toBe(cacheFixture.og.prefix)
    expect(og?.ttlSeconds).toBe(cacheFixture.og.ttlSeconds)
    expect(og?.pattern).toBe(`${cacheFixture.og.prefix}*`)
  })

  it('counts and clears the imageMeta bucket the same way as og/avatar/calendar', async () => {
    await seedEntry('imageMeta', 'image-meta:images/2024/06/cover.jpg')
    await seedEntry('imageMeta', 'image-meta:images/2024/06/banner.jpg')
    await seedEntry('og', 'og:foo')

    const stats = await getAdminCacheStats(db)
    const counts = Object.fromEntries(stats.buckets.map((b) => [b.id, b.keyCount]))
    expect(counts.imageMeta).toBe(2)

    const result = await clearAdminCache(db, 'imageMeta')
    expect(result.total).toBe(2)
    expect(result.cleared[0]?.bucketId).toBe('imageMeta')
    expect(await countEntryFiles('og')).toBe(1)
  })
})
