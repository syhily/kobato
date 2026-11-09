import { Buffer } from 'node:buffer'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const fileStoreMock = vi.hoisted(() => ({
  getItem: vi.fn<(bucket: string, key: string) => Promise<unknown>>(),
  getItemRaw: vi.fn<(bucket: string, key: string) => Promise<Buffer | null>>(),
  getItems: vi.fn<(bucket: string, keys: string[]) => Promise<{ key: string; value: unknown }[]>>(),
  removeItem: vi.fn<(bucket: string, key: string) => Promise<void>>(),
  setItem: vi.fn<(bucket: string, key: string, value: unknown, opts: unknown) => Promise<void>>(),
  setItemRaw: vi.fn<(bucket: string, key: string, value: Buffer, opts: unknown) => Promise<void>>(),
  readGeneration: vi.fn<(bucket: string) => Promise<number>>(),
  bumpGeneration: vi.fn<(bucket: string) => number>(),
  unlinkBucketEntriesSync: vi.fn<(bucket: string) => number>(),
  trashBucketSync: vi.fn<(bucket: string) => void>(),
}))

vi.mock('@/server/infra/cache/file-store', () => fileStoreMock)

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
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
  fileStoreMock.getItem.mockResolvedValue(null)
  fileStoreMock.getItemRaw.mockResolvedValue(null)
  fileStoreMock.getItems.mockImplementation(async (_bucket, keys) => keys.map((key) => ({ key, value: null })))
  fileStoreMock.removeItem.mockResolvedValue(undefined)
  fileStoreMock.setItem.mockResolvedValue(undefined)
  fileStoreMock.setItemRaw.mockResolvedValue(undefined)
  fileStoreMock.readGeneration.mockResolvedValue(0)
  fileStoreMock.bumpGeneration.mockReturnValue(1)
  fileStoreMock.unlinkBucketEntriesSync.mockReturnValue(0)
  fileStoreMock.trashBucketSync.mockReturnValue(undefined)
})

afterAll(() => {
  ;(import.meta.env as any).PROD = originalProd
})

describe('cache registry — through', () => {
  it('returns the cached value on a hit without running the loader', async () => {
    fileStoreMock.getItem.mockResolvedValue({ rss: '<rss/>', atom: '<atom/>' })
    const loader = vi.fn()
    const onHit = vi.fn()

    const value = await through(
      'feed',
      { scope: 'all', locale: 'zh-CN', version: APP_VERSION, settingsRevision: REVISIONS.feed },
      loader,
      { onHit },
    )

    expect(value).toEqual({ rss: '<rss/>', atom: '<atom/>' })
    expect(fileStoreMock.getItem).toHaveBeenCalledWith('feed', `feed:xml:zh-CN:${APP_VERSION}:${REVISIONS.feed}:all`)
    expect(loader).not.toHaveBeenCalled()
    expect(onHit).toHaveBeenCalledWith({ rss: '<rss/>', atom: '<atom/>' })
    expect(fileStoreMock.setItem).not.toHaveBeenCalled()
  })

  it('runs the loader on a miss and writes the result back', async () => {
    const loader = vi.fn().mockResolvedValue(['a', 'b'])

    const value = await through('categories', {}, loader)

    expect(value).toEqual(['a', 'b'])
    expect(loader).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => {
      expect(fileStoreMock.setItem).toHaveBeenCalledWith('categories', 'categories:all', ['a', 'b'], {
        ttlSeconds: 300,
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
    fileStoreMock.getItem.mockRejectedValue(new Error('disk down'))
    const loader = vi.fn().mockResolvedValue('<xml/>')

    const value = await through('sitemap', { settingsRevision: 'sitemap-rev' }, loader)

    expect(value).toBe('<xml/>')
    expect(loader).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => {
      expect(fileStoreMock.setItem).toHaveBeenCalledWith('sitemap', 'sitemap:xmlsitemap-rev', '<xml/>', {
        ttlSeconds: 300,
      })
    })
  })

  it('returns the loader value before a slow write settles (fire-and-forget)', async () => {
    let releaseWrite!: () => void
    fileStoreMock.setItem.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseWrite = resolve
        }),
    )
    const loader = vi.fn().mockResolvedValue(['c1'])

    await expect(through('comments', { settingsRevision: 'comments-rev', limit: 5 }, loader)).resolves.toEqual(['c1'])
    expect(fileStoreMock.setItem).toHaveBeenCalledTimes(1)
    // Proven by the still-pending write: the loader value already reached the caller.
    releaseWrite()
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
    fileStoreMock.getItemRaw.mockResolvedValue(Buffer.from('stale-png'))
    const loader = vi.fn().mockResolvedValue(Buffer.from('fresh-png'))

    const value = await through(
      'og',
      { slug: 'post-x', title: 'T', summary: 'S', cover: '', settingsRevision: REVISIONS.og },
      loader,
    )

    expect(value).toEqual(Buffer.from('fresh-png'))
    expect(fileStoreMock.getItemRaw).not.toHaveBeenCalled()
    expect(loader).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => {
      expect(fileStoreMock.setItemRaw).toHaveBeenCalledTimes(1)
    })
  })

  it('serves the cached entry in production', async () => {
    fileStoreMock.getItemRaw.mockResolvedValue(Buffer.from('cached-png'))
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

  it('round-trips both sentinel forms through get', async () => {
    fileStoreMock.getItemRaw.mockResolvedValueOnce(Buffer.from([AvatarStatus.NO_AVATAR]))
    await expect(get('avatar', { size: 80, email: 'a@b.c' })).resolves.toEqual({
      status: AvatarStatus.NO_AVATAR,
      buffer: null,
    })

    fileStoreMock.getItemRaw.mockResolvedValueOnce(
      Buffer.concat([Buffer.from([AvatarStatus.HAVE_AVATAR]), Buffer.from('png')]),
    )
    await expect(get('avatar', { size: 80, email: 'a@b.c' })).resolves.toEqual({
      status: AvatarStatus.HAVE_AVATAR,
      buffer: Buffer.from('png'),
    })
  })

  it('reads an unknown sentinel byte as a miss', async () => {
    fileStoreMock.getItemRaw.mockResolvedValueOnce(Buffer.from([7, 1, 2, 3]))
    await expect(get('avatar', { size: 80, email: 'a@b.c' })).resolves.toBeNull()
  })
})

describe('cache registry — get / set / remove / clear', () => {
  it('coalesces concurrent reads of the same key', async () => {
    fileStoreMock.getItem.mockResolvedValue({ found: false })

    const [a, b] = await Promise.all([
      get('imageMeta', { storagePath: 'x.png' }),
      get('imageMeta', { storagePath: 'x.png' }),
    ])

    expect(a).toEqual({ found: false })
    expect(b).toEqual({ found: false })
    expect(fileStoreMock.getItem).toHaveBeenCalledTimes(1)
    expect(fileStoreMock.getItem).toHaveBeenCalledWith('imageMeta', 'image-meta:x.png')
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
    fileStoreMock.getItems.mockResolvedValue([
      { key: 'image-meta:a.png', value: { found: true, storagePath: 'a.png' } },
      { key: 'image-meta:b.png', value: null },
      { key: 'image-meta:c.png', value: null },
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

    expect(fileStoreMock.getItems).toHaveBeenCalledWith('imageMeta', [
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
      { ttlSeconds: 3600 },
    )
    expect(fileStoreMock.setItem).toHaveBeenCalledWith(
      'imageMeta',
      'image-meta:c.png',
      { found: false },
      { ttlSeconds: 3600 },
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
