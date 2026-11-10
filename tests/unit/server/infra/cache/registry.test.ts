import { Buffer } from 'node:buffer'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fileStoreMock = vi.hoisted(() => ({
  getItemWithExpiry: vi.fn<(bucket: string, key: string) => Promise<{ value: unknown; expiresAtMs: number } | null>>(),
  getItemRawWithExpiry:
    vi.fn<(bucket: string, key: string) => Promise<{ value: Buffer; expiresAtMs: number } | null>>(),
  getItemsWithExpiry:
    vi.fn<
      (
        bucket: string,
        keys: string[],
      ) => Promise<{ key: string; entry: { value: unknown; expiresAtMs: number } | null }[]>
    >(),
  removeItem: vi.fn<(bucket: string, key: string) => Promise<void>>(),
  setItem: vi.fn<(bucket: string, key: string, value: unknown, opts: unknown) => Promise<string>>(),
  setItemRaw: vi.fn<(bucket: string, key: string, value: Buffer, opts: unknown) => Promise<void>>(),
  readGeneration: vi.fn<(bucket: string) => Promise<number>>(),
  bumpGeneration: vi.fn<(bucket: string) => number>(),
  unlinkBucketEntriesSync: vi.fn<(bucket: string) => number>(),
  trashBucketSync: vi.fn<(bucket: string) => void>(),
  wipeCache: vi.fn<() => Promise<void>>(),
}))

vi.mock('@/server/infra/cache/file-store', () => fileStoreMock)

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { __resetMemoryCacheForTests } from '@/server/infra/cache/memory-store'
import {
  __resetCacheCountersForTests,
  AvatarStatus,
  bumpCounter,
  clear,
  clearLocalizedOutputs,
  get,
  getCounter,
  remove,
  set,
  through,
  throughMany,
  wipeCacheForRestore,
} from '@/server/infra/cache/registry'
import { representationRevisionsFor } from '@/shared/config/representation-scopes'
import { APP_VERSION } from '@/shared/config/version'

// Content-addressed generations for the fixture settings — stable across runs.
const REVISIONS = representationRevisionsFor(TEST_BLOG_SETTINGS_BUNDLE)

// devBypass caches (og / calendar) skip reads outside production, so pin
// PROD on by default and flip it off only in the devBypass tests.
const originalProd = import.meta.env.PROD

beforeEach(() => {
  vi.clearAllMocks()
  ;(import.meta.env as any).PROD = true
  __resetCacheCountersForTests()
  __resetMemoryCacheForTests()
  fileStoreMock.getItemWithExpiry.mockResolvedValue(null)
  fileStoreMock.getItemRawWithExpiry.mockResolvedValue(null)
  fileStoreMock.getItemsWithExpiry.mockImplementation(async (_bucket, keys) =>
    keys.map((key) => ({ key, entry: null })),
  )
  fileStoreMock.removeItem.mockResolvedValue(undefined)
  // The real store returns the text it wrote; the registry parses it for L1.
  fileStoreMock.setItem.mockImplementation(async (_bucket, _key, value) => JSON.stringify(value))
  fileStoreMock.setItemRaw.mockResolvedValue(undefined)
  fileStoreMock.readGeneration.mockResolvedValue(0)
  fileStoreMock.bumpGeneration.mockReturnValue(1)
  fileStoreMock.unlinkBucketEntriesSync.mockReturnValue(0)
  fileStoreMock.trashBucketSync.mockReturnValue(undefined)
  fileStoreMock.wipeCache.mockResolvedValue(undefined)
})

afterAll(() => {
  ;(import.meta.env as any).PROD = originalProd
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** Pin `Date.now` so a write's derived deadline is assertable by exact value. */
function mockNow(iso: string): number {
  const now = Date.parse(iso)
  vi.spyOn(Date, 'now').mockReturnValue(now)
  return now
}

describe('cache registry — through', () => {
  it('returns the cached value on a hit without running the loader', async () => {
    fileStoreMock.getItemWithExpiry.mockResolvedValue({ value: { rss: '<rss/>', atom: '<atom/>' }, expiresAtMs: 0 })
    const loader = vi.fn()
    const onHit = vi.fn()

    const value = await through(
      'feed',
      { scope: 'all', locale: 'zh-CN', version: APP_VERSION, settingsRevision: REVISIONS.feed },
      loader,
      { onHit },
    )

    expect(value).toEqual({ rss: '<rss/>', atom: '<atom/>' })
    expect(fileStoreMock.getItemWithExpiry).toHaveBeenCalledWith(
      'feed',
      `feed:xml:zh-CN:${APP_VERSION}:${REVISIONS.feed}:all`,
    )
    expect(loader).not.toHaveBeenCalled()
    expect(onHit).toHaveBeenCalledWith({ rss: '<rss/>', atom: '<atom/>' })
    expect(fileStoreMock.setItem).not.toHaveBeenCalled()
  })

  it('runs the loader on a miss and writes the result back', async () => {
    const now = mockNow('2026-01-01T00:00:00.000Z')
    const loader = vi.fn().mockResolvedValue(['a', 'b'])

    const value = await through('categories', {}, loader)

    expect(value).toEqual(['a', 'b'])
    expect(loader).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => {
      expect(fileStoreMock.setItem).toHaveBeenCalledWith('categories', 'categories:all', ['a', 'b'], {
        expiresAtMs: now + 300_000,
      })
    })
  })

  it('coalesces concurrent misses for the same key into one loader run', async () => {
    let release!: (value: string[]) => void
    const loader = vi.fn(
      () =>
        new Promise<string[]>((resolve) => {
          release = resolve
        }),
    )

    const first = through('tags', {}, loader)
    const second = through('tags', {}, loader)
    // The loader starts after the async read path — wait for it, then release.
    await vi.waitFor(() => {
      expect(loader).toHaveBeenCalledTimes(1)
    })
    release(['x'])

    await expect(first).resolves.toEqual(['x'])
    await expect(second).resolves.toEqual(['x'])
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('degrades to a plain load when the read fails', async () => {
    const now = mockNow('2026-01-01T00:00:00.000Z')
    fileStoreMock.getItemWithExpiry.mockRejectedValue(new Error('disk down'))
    const loader = vi.fn().mockResolvedValue('<xml/>')

    const value = await through('sitemap', { settingsRevision: 'sitemap-rev' }, loader)

    expect(value).toBe('<xml/>')
    expect(loader).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => {
      expect(fileStoreMock.setItem).toHaveBeenCalledWith('sitemap', 'sitemap:xmlsitemap-rev', '<xml/>', {
        expiresAtMs: now + 300_000,
      })
    })
  })

  it('returns the loader value before a slow write settles (fire-and-forget)', async () => {
    let releaseWrite!: (text: string) => void
    fileStoreMock.setItem.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          releaseWrite = resolve
        }),
    )
    const loader = vi.fn().mockResolvedValue(['c1'])

    await expect(through('comments', { settingsRevision: 'comments-rev', limit: 5 }, loader)).resolves.toEqual(['c1'])
    expect(fileStoreMock.setItem).toHaveBeenCalledTimes(1)
    // Proven by the still-pending write: the loader value already reached the caller.
    releaseWrite('["c1"]')
  })

  it('still returns the loader value when the write fails, without an unhandled rejection', async () => {
    fileStoreMock.setItem.mockRejectedValue(new Error('disk down'))
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    try {
      const loader = vi.fn().mockResolvedValue(['c1'])
      const value = await through('comments', { settingsRevision: 'comments-rev', limit: 5 }, loader)
      expect(value).toEqual(['c1'])
      // Let the rejected fire-and-forget write settle inside writeEntry's catch.
      await new Promise((resolve) => setImmediate(resolve))
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
    expect(unhandled).toEqual([])
  })

  it('swallows ttlFor and codec failures without rejecting the lookup', async () => {
    fileStoreMock.setItemRaw.mockImplementation(() => {
      throw new Error('codec exploded')
    })
    const loader = vi.fn().mockResolvedValue(Buffer.from('png'))

    await expect(
      through('og', { slug: 'post-x', title: 'T', summary: 'S', cover: '', settingsRevision: REVISIONS.og }, loader),
    ).resolves.toEqual(Buffer.from('png'))
  })

  it('skips the write when cacheWhen rejects the loader value', async () => {
    const loader = vi.fn().mockResolvedValue([])

    const value = await through('searchResult', { generation: 3, parts: ['like', 'foo'] }, loader)

    expect(value).toEqual([])
    expect(fileStoreMock.setItem).not.toHaveBeenCalled()
  })
})

describe('cache registry — devBypass', () => {
  it('re-runs the loader in dev but still writes the entry', async () => {
    ;(import.meta.env as any).PROD = false
    fileStoreMock.getItemRawWithExpiry.mockResolvedValue({ value: Buffer.from('stale-png'), expiresAtMs: 0 })
    const loader = vi.fn().mockResolvedValue(Buffer.from('fresh-png'))

    const value = await through(
      'og',
      { slug: 'post-x', title: 'T', summary: 'S', cover: '', settingsRevision: REVISIONS.og },
      loader,
    )

    expect(value).toEqual(Buffer.from('fresh-png'))
    expect(fileStoreMock.getItemRawWithExpiry).not.toHaveBeenCalled()
    expect(loader).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => {
      expect(fileStoreMock.setItemRaw).toHaveBeenCalledTimes(1)
    })
  })

  it('serves the cached entry in production', async () => {
    fileStoreMock.getItemRawWithExpiry.mockResolvedValue({ value: Buffer.from('cached-png'), expiresAtMs: 0 })
    const loader = vi.fn()

    const value = await through(
      'calendar',
      {
        date: '2026-06-17',
        theme: 'light',
        locale: 'zh-CN',
        version: APP_VERSION,
        settingsRevision: REVISIONS.calendar,
      },
      loader,
    )

    expect(value).toEqual(Buffer.from('cached-png'))
    expect(loader).not.toHaveBeenCalled()
  })
})

describe('cache registry — key shapes', () => {
  it('folds the settings revision and the OG render inputs into the key', async () => {
    const params = {
      slug: 'post-x',
      title: 'T',
      summary: 'S',
      cover: 'C',
      settingsRevision: REVISIONS.og,
    }
    await set('og', params, Buffer.from('png'))

    const key = fileStoreMock.setItemRaw.mock.calls[0]?.[1] as string
    expect(key.startsWith(`og:${REVISIONS.og}:post-x-`)).toBe(true)
    expect(key.slice(`og:${REVISIONS.og}:post-x-`.length)).toMatch(/^[0-9a-f]{16}$/)

    // A settings save (or any input edit) must move the key.
    await set('og', { ...params, title: 'T2' }, Buffer.from('png'))
    const otherKey = fileStoreMock.setItemRaw.mock.calls[1]?.[1] as string
    expect(otherKey).not.toBe(key)

    await set('og', { ...params, settingsRevision: 'other-boot:0000000001' }, Buffer.from('png'))
    const nextGeneration = fileStoreMock.setItemRaw.mock.calls[2]?.[1] as string
    expect(nextGeneration).not.toBe(key)
    expect(nextGeneration.startsWith('og:other-boot:0000000001:post-x-')).toBe(true)
  })

  it('suffixes the dark calendar variant', async () => {
    await set(
      'calendar',
      {
        date: '2026-06-17',
        theme: 'dark',
        locale: 'zh-CN',
        version: APP_VERSION,
        settingsRevision: REVISIONS.calendar,
      },
      Buffer.from('png'),
    )
    await set(
      'calendar',
      {
        date: '2026-06-17',
        theme: 'light',
        locale: 'zh-CN',
        version: APP_VERSION,
        settingsRevision: REVISIONS.calendar,
      },
      Buffer.from('png'),
    )

    expect(fileStoreMock.setItemRaw.mock.calls[0]?.[1]).toBe(
      `calendar:zh-CN:${APP_VERSION}:${REVISIONS.calendar}:2026-06-17-dark`,
    )
    expect(fileStoreMock.setItemRaw.mock.calls[1]?.[1]).toBe(
      `calendar:zh-CN:${APP_VERSION}:${REVISIONS.calendar}:2026-06-17`,
    )
  })

  it('carries the fetch size in the avatar key', async () => {
    await set('avatar', { size: 120, email: 'a@b.c' }, { status: AvatarStatus.HAVE_AVATAR, buffer: Buffer.from('x') })

    expect(fileStoreMock.setItemRaw.mock.calls[0]?.[1]).toBe('avatar:120:a@b.c')
  })

  it('hashes the search key parts', async () => {
    await set('searchResult', { generation: 7, parts: ['foo'] }, ['a'])
    const searchKey = fileStoreMock.setItem.mock.calls[0]?.[1] as string
    expect(searchKey).toMatch(/^search-result:7:[0-9a-f]{64}$/)
  })
})

describe('cache registry — avatar sentinel codec', () => {
  it('encodes a present avatar as sentinel byte 0 + payload', async () => {
    await set('avatar', { size: 80, email: 'a@b.c' }, { status: AvatarStatus.HAVE_AVATAR, buffer: Buffer.from('png') })

    const blob = fileStoreMock.setItemRaw.mock.calls[0]?.[2] as Buffer
    expect(blob[0]).toBe(AvatarStatus.HAVE_AVATAR)
    expect(blob.subarray(1).toString()).toBe('png')
  })

  it('encodes a missing avatar as the lone sentinel byte 1', async () => {
    await set('avatar', { size: 80, email: 'a@b.c' }, { status: AvatarStatus.NO_AVATAR, buffer: null })

    const blob = fileStoreMock.setItemRaw.mock.calls[0]?.[2] as Buffer
    expect(blob).toEqual(Buffer.from([AvatarStatus.NO_AVATAR]))
  })

  it('treats a HAVE_AVATAR entry with a null buffer as the negative sentinel', async () => {
    // The codec refuses to write a payload-less positive entry — a corrupt
    // in-memory shape degrades to the negative sentinel instead of an
    // undecodable blob.
    await set('avatar', { size: 80, email: 'a@b.c' }, { status: AvatarStatus.HAVE_AVATAR, buffer: null })

    const blob = fileStoreMock.setItemRaw.mock.calls[0]?.[2] as Buffer
    expect(blob).toEqual(Buffer.from([AvatarStatus.NO_AVATAR]))
  })

  it('round-trips the NO_AVATAR sentinel through get', async () => {
    fileStoreMock.getItemRawWithExpiry.mockResolvedValueOnce({
      value: Buffer.from([AvatarStatus.NO_AVATAR]),
      expiresAtMs: 0,
    })
    await expect(get('avatar', { size: 80, email: 'a@b.c' })).resolves.toEqual({
      status: AvatarStatus.NO_AVATAR,
      buffer: null,
    })
  })

  it('round-trips the HAVE_AVATAR sentinel through get', async () => {
    fileStoreMock.getItemRawWithExpiry.mockResolvedValueOnce({
      value: Buffer.concat([Buffer.from([AvatarStatus.HAVE_AVATAR]), Buffer.from('png')]),
      expiresAtMs: 0,
    })
    await expect(get('avatar', { size: 80, email: 'a@b.c' })).resolves.toEqual({
      status: AvatarStatus.HAVE_AVATAR,
      buffer: Buffer.from('png'),
    })
  })

  it('reads an unknown sentinel byte as a miss', async () => {
    fileStoreMock.getItemRawWithExpiry.mockResolvedValueOnce({ value: Buffer.from([7, 1, 2, 3]), expiresAtMs: 0 })
    await expect(get('avatar', { size: 80, email: 'a@b.c' })).resolves.toBeNull()
  })
})

describe('cache registry — get / set / remove / clear', () => {
  it('coalesces concurrent reads of the same key', async () => {
    fileStoreMock.getItemWithExpiry.mockResolvedValue({ value: { found: false }, expiresAtMs: 0 })

    const [a, b] = await Promise.all([
      get('imageMeta', { storagePath: 'x.png' }),
      get('imageMeta', { storagePath: 'x.png' }),
    ])

    expect(a).toEqual({ found: false })
    expect(b).toEqual({ found: false })
    expect(fileStoreMock.getItemWithExpiry).toHaveBeenCalledTimes(1)
    expect(fileStoreMock.getItemWithExpiry).toHaveBeenCalledWith('imageMeta', 'image-meta:x.png')
  })

  it('remove deletes the computed key', async () => {
    await remove('imageMeta', { storagePath: 'x.png' })

    expect(fileStoreMock.removeItem).toHaveBeenCalledWith('imageMeta', 'image-meta:x.png')
  })

  it('clear unlinks the bucket synchronously, not by prefix scan', () => {
    clear('feed')

    expect(fileStoreMock.unlinkBucketEntriesSync).toHaveBeenCalledTimes(1)
    expect(fileStoreMock.unlinkBucketEntriesSync).toHaveBeenCalledWith('feed')
  })

  it('clear swallows a filesystem failure (best-effort invalidation)', () => {
    fileStoreMock.unlinkBucketEntriesSync.mockImplementation(() => {
      throw new Error('disk gone')
    })

    expect(() => clear('feed')).not.toThrow()
  })

  it('clearLocalizedOutputs renames every settings-derived bucket and throws the first failure', () => {
    fileStoreMock.trashBucketSync.mockImplementation(() => {
      throw new Error('rename failed')
    })

    expect(() => clearLocalizedOutputs()).toThrow('rename failed')
    expect(fileStoreMock.trashBucketSync.mock.calls.map(([bucket]) => bucket)).toEqual([
      'feed',
      'calendar',
      'og',
      'comments',
      'sitemap',
    ])
  })
})

describe('cache registry — throughMany', () => {
  it('returns entries in input order, loads misses, and writes them back', async () => {
    const now = mockNow('2026-01-01T00:00:00.000Z')
    fileStoreMock.getItemsWithExpiry.mockResolvedValue([
      { key: 'image-meta:a.png', entry: { value: { found: true, storagePath: 'a.png' }, expiresAtMs: 0 } },
      { key: 'image-meta:b.png', entry: null },
      { key: 'image-meta:c.png', entry: null },
    ])
    const loader = vi.fn().mockResolvedValue([
      { params: { storagePath: 'b.png' }, value: { found: true, storagePath: 'b.png' } },
      { params: { storagePath: 'c.png' }, value: { found: false } },
    ])

    const result = await throughMany(
      'imageMeta',
      [{ storagePath: 'a.png' }, { storagePath: 'b.png' }, { storagePath: 'c.png' }],
      loader,
    )

    expect(fileStoreMock.getItemsWithExpiry).toHaveBeenCalledWith('imageMeta', [
      'image-meta:a.png',
      'image-meta:b.png',
      'image-meta:c.png',
    ])
    expect(loader).toHaveBeenCalledWith([{ storagePath: 'b.png' }, { storagePath: 'c.png' }])
    expect(result).toEqual([
      { params: { storagePath: 'a.png' }, value: { found: true, storagePath: 'a.png' } },
      { params: { storagePath: 'b.png' }, value: { found: true, storagePath: 'b.png' } },
      { params: { storagePath: 'c.png' }, value: { found: false } },
    ])
    await vi.waitFor(() => {
      expect(fileStoreMock.setItem).toHaveBeenCalledTimes(2)
    })
    expect(fileStoreMock.setItem).toHaveBeenCalledWith(
      'imageMeta',
      'image-meta:b.png',
      { found: true, storagePath: 'b.png' },
      { expiresAtMs: now + 3_600_000 },
    )
    expect(fileStoreMock.setItem).toHaveBeenCalledWith(
      'imageMeta',
      'image-meta:c.png',
      { found: false },
      { expiresAtMs: now + 3_600_000 },
    )
  })

  it('returns null for misses the loader did not cover', async () => {
    const loader = vi.fn().mockResolvedValue([])

    const result = await throughMany('imageMeta', [{ storagePath: 'a.png' }], loader)

    expect(result).toEqual([{ params: { storagePath: 'a.png' }, value: null }])
    expect(fileStoreMock.setItem).not.toHaveBeenCalled()
  })
})

describe('cache registry — counters', () => {
  it('rejects buckets that declare no counter', () => {
    expect(() => getCounter('og')).toThrow("cache 'og' declares no counter")
    expect(() => bumpCounter('feed')).toThrow("cache 'feed' declares no counter")
  })

  it('memoizes the generation and refreshes it on bump', async () => {
    fileStoreMock.readGeneration.mockResolvedValue(7)
    fileStoreMock.bumpGeneration.mockReturnValue(8)

    await expect(getCounter('searchResult')).resolves.toBe(7)
    await expect(getCounter('searchResult')).resolves.toBe(7)
    expect(fileStoreMock.readGeneration).toHaveBeenCalledTimes(1)

    expect(bumpCounter('searchResult')).toBe(8)
    expect(fileStoreMock.bumpGeneration).toHaveBeenCalledWith('searchResult')
    await expect(getCounter('searchResult')).resolves.toBe(8)
    // The bump publishes the new value into the memo; no second file read.
    expect(fileStoreMock.readGeneration).toHaveBeenCalledTimes(1)
  })

  it('does not memoize a failed read as generation 0', async () => {
    fileStoreMock.readGeneration.mockRejectedValueOnce(new Error('disk down')).mockResolvedValueOnce(5)

    await expect(getCounter('searchResult')).resolves.toBe(0)
    await expect(getCounter('searchResult')).resolves.toBe(5)
    expect(fileStoreMock.readGeneration).toHaveBeenCalledTimes(2)
  })

  it('re-reads the counter after the test reset', async () => {
    fileStoreMock.readGeneration.mockResolvedValue(42)

    await expect(getCounter('searchResult')).resolves.toBe(42)
    __resetCacheCountersForTests()
    await expect(getCounter('searchResult')).resolves.toBe(42)
    expect(fileStoreMock.readGeneration).toHaveBeenCalledTimes(2)
  })

  it('swallows a bump failure and reports it as null (best-effort invalidation)', () => {
    fileStoreMock.bumpGeneration.mockImplementation(() => {
      throw new Error('rename failed')
    })

    expect(bumpCounter('searchResult')).toBeNull()
  })
})

describe('cache registry — L1 memory tier', () => {
  it('serves a disk hit from L1 on the next read', async () => {
    fileStoreMock.getItemWithExpiry.mockResolvedValue({ value: { meta: 1 }, expiresAtMs: 0 })

    await expect(get('imageMeta', { storagePath: 'a.png' })).resolves.toEqual({ meta: 1 })
    await expect(get('imageMeta', { storagePath: 'a.png' })).resolves.toEqual({ meta: 1 })

    expect(fileStoreMock.getItemWithExpiry).toHaveBeenCalledTimes(1)
  })

  it('backfills the decoded binary value', async () => {
    fileStoreMock.getItemRawWithExpiry.mockResolvedValue({
      value: Buffer.concat([Buffer.from([AvatarStatus.HAVE_AVATAR]), Buffer.from('png')]),
      expiresAtMs: 0,
    })

    await expect(get('avatar', { size: 80, email: 'a@b.c' })).resolves.toEqual({
      status: AvatarStatus.HAVE_AVATAR,
      buffer: Buffer.from('png'),
    })
    await get('avatar', { size: 80, email: 'a@b.c' })

    expect(fileStoreMock.getItemRawWithExpiry).toHaveBeenCalledTimes(1)
  })

  it('mirrors the decoded binary shape, not the raw write value', async () => {
    // encodeAvatar normalizes a payload-less positive to the NO_AVATAR sentinel;
    // L1 must publish the decoded shape a disk read would produce.
    await set('avatar', { size: 80, email: 'a@b.c' }, { status: AvatarStatus.HAVE_AVATAR, buffer: null })

    await expect(get('avatar', { size: 80, email: 'a@b.c' })).resolves.toEqual({
      status: AvatarStatus.NO_AVATAR,
      buffer: null,
    })
    expect(fileStoreMock.getItemRawWithExpiry).not.toHaveBeenCalled()
  })

  it('mirrors the JSON round-trip a disk read would produce', async () => {
    await set(
      'imageMeta',
      { storagePath: 'x.png' },
      {
        count: Number.NaN,
        at: new Date('2026-01-01T00:00:00.000Z'),
        nested: { missing: undefined, kept: 1 },
      },
    )

    const cached = (await get('imageMeta', { storagePath: 'x.png' })) as {
      count: unknown
      at: unknown
      nested: Record<string, unknown>
    }

    // A memory hit must be observationally identical to a disk hit: NaN → null,
    // Date → ISO string, undefined fields dropped.
    expect(cached.count).toBeNull()
    expect(cached.at).toBe('2026-01-01T00:00:00.000Z')
    expect(cached.nested).toEqual({ kept: 1 })
    expect('missing' in cached.nested).toBe(false)
    expect(fileStoreMock.getItemWithExpiry).not.toHaveBeenCalled()
  })

  it('gives the disk envelope and L1 the same absolute deadline', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
      await set('categories', {}, ['cat'])
      const options = fileStoreMock.setItem.mock.calls[0]?.[3] as { expiresAtMs: number }
      expect(options.expiresAtMs).toBe(Date.now() + 300_000)

      // At the shared deadline both planes miss; a fresh L1 deadline would serve it.
      vi.setSystemTime(new Date(options.expiresAtMs))
      await expect(get('categories', {})).resolves.toBeNull()
      expect(fileStoreMock.getItemWithExpiry).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('honours the envelope deadline when backfilling, not a fresh one', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
      fileStoreMock.getItemWithExpiry
        .mockResolvedValueOnce({ value: 'v', expiresAtMs: Date.now() + 1_000 })
        .mockResolvedValue(null)

      await expect(get('tags', {})).resolves.toBe('v')
      vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'))
      // A fresh deadline would serve the value from L1; the envelope's own
      // deadline expired, so the read falls through to disk (a miss).
      await expect(get('tags', {})).resolves.toBeNull()

      expect(fileStoreMock.getItemWithExpiry).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('mirrors a successful write so a later read never touches disk', async () => {
    await set('categories', {}, ['cat'])

    await expect(get('categories', {})).resolves.toEqual(['cat'])
    expect(fileStoreMock.getItemWithExpiry).not.toHaveBeenCalled()
  })

  it('does not mirror a write whose disk leg failed', async () => {
    fileStoreMock.setItem.mockRejectedValue(new Error('disk down'))

    await set('categories', {}, ['cat'])

    await expect(get('categories', {})).resolves.toBeNull()
    expect(fileStoreMock.getItemWithExpiry).toHaveBeenCalledTimes(1)
  })

  it('remove evicts the memory copy even when the unlink fails', async () => {
    await set('imageMeta', { storagePath: 'x.png' }, { found: true })
    fileStoreMock.removeItem.mockRejectedValue(new Error('disk gone'))
    fileStoreMock.getItemWithExpiry.mockResolvedValue(null)

    await remove('imageMeta', { storagePath: 'x.png' })

    await expect(get('imageMeta', { storagePath: 'x.png' })).resolves.toBeNull()
    expect(fileStoreMock.getItemWithExpiry).toHaveBeenCalledTimes(1)
  })

  it('clear drops the bucket memory tier even when the unlink fails', async () => {
    await set('categories', {}, ['cat'])
    fileStoreMock.unlinkBucketEntriesSync.mockImplementation(() => {
      throw new Error('disk gone')
    })

    clear('categories')

    await expect(get('categories', {})).resolves.toBeNull()
    expect(fileStoreMock.getItemWithExpiry).toHaveBeenCalledTimes(1)
  })

  it('clearLocalizedOutputs drops all five memory tiers', async () => {
    const feed = { scope: 'all', locale: 'zh-CN' as const, version: APP_VERSION, settingsRevision: REVISIONS.feed }
    const calendar = {
      date: '2026-06-17',
      theme: 'light' as const,
      locale: 'zh-CN' as const,
      version: APP_VERSION,
      settingsRevision: REVISIONS.calendar,
    }
    const og = { slug: 'post-x', title: 'T', summary: 'S', cover: '', settingsRevision: REVISIONS.og }
    const sitemap = { settingsRevision: 'sitemap-rev' }
    const comments = { settingsRevision: 'comments-rev', limit: 5 }
    await set('feed', feed, { rss: 'x' })
    await set('calendar', calendar, Buffer.from('png'))
    await set('og', og, Buffer.from('png'))
    await set('sitemap', sitemap, '<urlset/>')
    await set('comments', comments, ['c'])

    clearLocalizedOutputs()

    // Every bucket's memory tier is gone: each read has to reach the disk plane
    // (whose mock answers null), so nothing is served from L1.
    await expect(get('feed', feed)).resolves.toBeNull()
    await expect(get('calendar', calendar)).resolves.toBeNull()
    await expect(get('og', og)).resolves.toBeNull()
    await expect(get('sitemap', sitemap)).resolves.toBeNull()
    await expect(get('comments', comments)).resolves.toBeNull()
    expect(fileStoreMock.getItemWithExpiry).toHaveBeenCalledTimes(3)
    expect(fileStoreMock.getItemRawWithExpiry).toHaveBeenCalledTimes(2)
  })

  it('wipeCacheForRestore drops every memory entry', async () => {
    await set('categories', {}, ['cat'])

    await wipeCacheForRestore()

    await expect(get('categories', {})).resolves.toBeNull()
    expect(fileStoreMock.wipeCache).toHaveBeenCalledTimes(1)
  })

  it('serves throughMany from L1 and batch-reads only the rest', async () => {
    await set('imageMeta', { storagePath: 'a.png' }, { found: true, storagePath: 'a.png' })
    fileStoreMock.getItemsWithExpiry.mockResolvedValue([
      { key: 'image-meta:b.png', entry: { value: { found: false }, expiresAtMs: 0 } },
    ])
    const loader = vi.fn()

    const result = await throughMany('imageMeta', [{ storagePath: 'a.png' }, { storagePath: 'b.png' }], loader)

    expect(result).toEqual([
      { params: { storagePath: 'a.png' }, value: { found: true, storagePath: 'a.png' } },
      { params: { storagePath: 'b.png' }, value: { found: false } },
    ])
    expect(fileStoreMock.getItemsWithExpiry).toHaveBeenCalledWith('imageMeta', ['image-meta:b.png'])
    expect(loader).not.toHaveBeenCalled()

    // The disk hit is mirrored, so a second pass reads both keys from L1.
    await throughMany('imageMeta', [{ storagePath: 'a.png' }, { storagePath: 'b.png' }], loader)
    expect(fileStoreMock.getItemsWithExpiry).toHaveBeenCalledTimes(1)
  })

  it('treats a literal null payload as a miss in throughMany', async () => {
    fileStoreMock.getItemsWithExpiry.mockResolvedValue([
      { key: 'image-meta:a.png', entry: { value: null, expiresAtMs: 0 } },
    ])
    const loader = vi.fn().mockResolvedValue([{ params: { storagePath: 'a.png' }, value: { found: true } }])

    const result = await throughMany('imageMeta', [{ storagePath: 'a.png' }], loader)

    // Same miss semantics as readEntry: the loader must run for a null payload.
    expect(loader).toHaveBeenCalledWith([{ storagePath: 'a.png' }])
    expect(result).toEqual([{ params: { storagePath: 'a.png' }, value: { found: true } }])
  })
})
