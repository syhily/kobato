import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import {
  __resetCacheCountersForTests,
  bumpCounter,
  clear,
  get,
  getCounter,
  remove,
  through,
  throughMany,
} from '@/server/infra/cache/registry'
import { kvCache } from '@/server/infra/db/schema/kv-cache'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  __resetCacheCountersForTests()
})

async function findRow(key: string) {
  const rows = await db.select().from(kvCache).where(eq(kvCache.key, key)).limit(1)
  return rows[0] ?? null
}

describe('cache registry (integration)', () => {
  it('through round-trips a json entry: miss → loader, then hit', async () => {
    const loader = vi.fn().mockResolvedValue({ rss: '<rss/>', atom: '<atom/>' })

    const first = await through(db, 'feed', { scope: 'all' }, loader)
    const second = await through(db, 'feed', { scope: 'all' }, loader)

    expect(first).toEqual({ rss: '<rss/>', atom: '<atom/>' })
    expect(second).toEqual(first)
    expect(loader).toHaveBeenCalledTimes(1)

    const row = await findRow('feed:xml:all')
    expect(row?.bucket).toBe('feed')
    expect(row?.expiresAt).not.toBeNull()
  })

  it('throughMany serves hits, loads misses, and caches negatives', async () => {
    const loader = vi.fn().mockResolvedValue([
      {
        params: { storagePath: 'a.png' },
        value: {
          found: true,
          storagePath: 'a.png',
          driver: 'local',
          width: 10,
          height: 20,
          thumbhash: null,
          updatedAtMs: 1,
        },
      },
      { params: { storagePath: 'b.png' }, value: { found: false } },
    ])

    const first = await throughMany(db, 'imageMeta', [{ storagePath: 'a.png' }, { storagePath: 'b.png' }], loader)
    expect(first[0]?.value).toMatchObject({ found: true, width: 10 })
    expect(first[1]?.value).toEqual({ found: false })

    // Second pass: both entries are cached, the negative included.
    const second = await throughMany(db, 'imageMeta', [{ storagePath: 'a.png' }, { storagePath: 'b.png' }], loader)
    expect(second[1]?.value).toEqual({ found: false })
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('clear deletes only the targeted bucket', async () => {
    await through(db, 'feed', { scope: 'all' }, async () => 'feed-xml')
    await through(db, 'tags', {}, async () => ['tag'])

    await clear(db, 'feed')

    expect(await findRow('feed:xml:all')).toBeNull()
    expect(await findRow('tags:all')).not.toBeNull()
  })

  it('remove deletes a single computed key', async () => {
    await through(db, 'categories', {}, async () => ['cat'])
    await remove(db, 'categories', {})

    expect(await findRow('categories:all')).toBeNull()
  })

  it('counter starts at 0, bumps monotonically, and memoizes', async () => {
    expect(await getCounter(db, 'searchResult')).toBe(0)

    await bumpCounter(db, 'searchResult')
    await bumpCounter(db, 'searchResult')
    expect(await getCounter(db, 'searchResult')).toBe(2)

    const row = await findRow('search-result:generation')
    expect(row?.bucket).toBe('searchResult')
    expect(row?.expiresAt).toBeNull()
  })

  it('counter re-reads the row after the test reset', async () => {
    await bumpCounter(db, 'searchResult')
    expect(await getCounter(db, 'searchResult')).toBe(1)

    // An out-of-band writer (e.g. a SQL shell) edits the counter directly.
    await db.update(kvCache).set({ value: 9 }).where(eq(kvCache.key, 'search-result:generation'))
    __resetCacheCountersForTests()

    expect(await getCounter(db, 'searchResult')).toBe(9)
  })

  it('devBypass re-runs the loader in dev but still writes the entry', async () => {
    // Vitest runs with PROD === false, so devBypass re-runs the loader on every through.
    const loader = vi.fn().mockResolvedValue(Buffer.from('png-1'))
    const params = { slug: 'post-x', title: 'T', summary: 'S', cover: '' }

    await through(db, 'og', params, loader)
    loader.mockResolvedValue(Buffer.from('png-2'))
    await through(db, 'og', params, loader)

    expect(loader).toHaveBeenCalledTimes(2)

    const cached = await get(db, 'og', params)
    expect(cached).toEqual(Buffer.from('png-2'))
  })
})
