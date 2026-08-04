import type { Database } from '@kobato/server/infra/db/database'

import { Buffer } from 'node:buffer'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const kvStoreMock = vi.hoisted(() => ({
  getItem: vi.fn<(db: unknown, key: string) => Promise<unknown>>(),
  getItemRaw: vi.fn<(db: unknown, key: string) => Promise<Buffer | null>>(),
  getItems: vi.fn<(db: unknown, keys: string[]) => Promise<{ key: string; value: unknown }[]>>(),
  removeItem: vi.fn<(db: unknown, key: string) => Promise<void>>(),
  setItem: vi.fn<(db: unknown, key: string, value: unknown, opts: unknown) => Promise<void>>(),
  setItemRaw: vi.fn<(db: unknown, key: string, value: Buffer, opts: unknown) => Promise<void>>(),
}))

vi.mock('@kobato/server/infra/cache/kv-store', () => kvStoreMock)

import {
  __resetCacheCountersForTests,
  AvatarStatus,
  bumpCounter,
  clear,
  get,
  getCounter,
  remove,
  set,
  through,
  throughMany,
} from '@kobato/server/infra/cache/registry'

// The db handle is only forwarded to the mocked kv-store (and to the
// delete/execute chains, which get their own stand-ins below) — a plain
// object is enough for the unit scope.
const db = {} as Database

// devBypass caches (og / calendar) skip reads outside production, so pin
// PROD on by default and flip it off only in the devBypass tests.
const originalProd = import.meta.env.PROD

beforeEach(() => {
  vi.clearAllMocks()
  ;(import.meta.env as any).PROD = true
  __resetCacheCountersForTests()
  kvStoreMock.getItem.mockResolvedValue(null)
  kvStoreMock.getItemRaw.mockResolvedValue(null)
  kvStoreMock.getItems.mockImplementation(async (_db, keys) => keys.map((key) => ({ key, value: null })))
  kvStoreMock.removeItem.mockResolvedValue(undefined)
  kvStoreMock.setItem.mockResolvedValue(undefined)
  kvStoreMock.setItemRaw.mockResolvedValue(undefined)
})

afterAll(() => {
  ;(import.meta.env as any).PROD = originalProd
})

describe('cache registry — through', () => {
  it('returns the cached value on a hit without running the loader', async () => {
    kvStoreMock.getItem.mockResolvedValue({ rss: '<rss/>', atom: '<atom/>' })
    const loader = vi.fn()
    const onHit = vi.fn()

    const value = await through(db, 'feed', { scope: 'all' }, loader, { onHit })

    expect(value).toEqual({ rss: '<rss/>', atom: '<atom/>' })
    expect(kvStoreMock.getItem).toHaveBeenCalledWith(db, 'feed:xml:all')
    expect(loader).not.toHaveBeenCalled()
    expect(onHit).toHaveBeenCalledWith({ rss: '<rss/>', atom: '<atom/>' })
    expect(kvStoreMock.setItem).not.toHaveBeenCalled()
  })

  it('runs the loader on a miss and writes the result back', async () => {
    const loader = vi.fn().mockResolvedValue(['a', 'b'])

    const value = await through(db, 'categories', {}, loader)

    expect(value).toEqual(['a', 'b'])
    expect(loader).toHaveBeenCalledTimes(1)
    expect(kvStoreMock.setItem).toHaveBeenCalledWith(db, 'categories:all', ['a', 'b'], {
      ttlSeconds: 300,
      bucket: 'categories',
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

    const first = through(db, 'tags', {}, loader)
    const second = through(db, 'tags', {}, loader)
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
    kvStoreMock.getItem.mockRejectedValue(new Error('db down'))
    const loader = vi.fn().mockResolvedValue('<xml/>')

    const value = await through(db, 'sitemap', {}, loader)

    expect(value).toBe('<xml/>')
    expect(loader).toHaveBeenCalledTimes(1)
    expect(kvStoreMock.setItem).toHaveBeenCalledWith(db, 'sitemap:xml', '<xml/>', {
      ttlSeconds: 300,
      bucket: 'sitemap',
    })
  })

  it('still returns the loader value when the write fails', async () => {
    kvStoreMock.setItem.mockRejectedValue(new Error('db down'))
    const loader = vi.fn().mockResolvedValue(['c1'])

    const value = await through(db, 'comments', {}, loader)

    expect(value).toEqual(['c1'])
  })

  it('skips the write when cacheWhen rejects the loader value', async () => {
    const loader = vi.fn().mockResolvedValue([])

    const value = await through(db, 'searchResult', { generation: 3, parts: ['like', 'foo'] }, loader)

    expect(value).toEqual([])
    expect(kvStoreMock.setItem).not.toHaveBeenCalled()
  })
})

describe('cache registry — devBypass', () => {
  it('re-runs the loader in dev but still writes the entry', async () => {
    ;(import.meta.env as any).PROD = false
    kvStoreMock.getItemRaw.mockResolvedValue(Buffer.from('stale-png'))
    const loader = vi.fn().mockResolvedValue(Buffer.from('fresh-png'))

    const value = await through(db, 'og', { slug: 'post-x', title: 'T', summary: 'S', cover: '' }, loader)

    expect(value).toEqual(Buffer.from('fresh-png'))
    expect(kvStoreMock.getItemRaw).not.toHaveBeenCalled()
    expect(loader).toHaveBeenCalledTimes(1)
    expect(kvStoreMock.setItemRaw).toHaveBeenCalledTimes(1)
  })

  it('serves the cached entry in production', async () => {
    kvStoreMock.getItemRaw.mockResolvedValue(Buffer.from('cached-png'))
    const loader = vi.fn()

    const value = await through(db, 'calendar', { date: '2026-06-17', theme: 'light' }, loader)

    expect(value).toEqual(Buffer.from('cached-png'))
    expect(loader).not.toHaveBeenCalled()
  })
})

describe('cache registry — key shapes', () => {
  it('folds the OG render inputs into a content hash', async () => {
    await set(db, 'og', { slug: 'post-x', title: 'T', summary: 'S', cover: 'C' }, Buffer.from('png'))

    const key = kvStoreMock.setItemRaw.mock.calls[0]?.[1] as string
    expect(key).toMatch(/^og:post-x-[0-9a-f]{16}$/)

    await set(db, 'og', { slug: 'post-x', title: 'T2', summary: 'S', cover: 'C' }, Buffer.from('png'))
    const otherKey = kvStoreMock.setItemRaw.mock.calls[1]?.[1] as string
    expect(otherKey).not.toBe(key)
  })

  it('suffixes the dark calendar variant', async () => {
    await set(db, 'calendar', { date: '2026-06-17', theme: 'dark' }, Buffer.from('png'))
    await set(db, 'calendar', { date: '2026-06-17', theme: 'light' }, Buffer.from('png'))

    expect(kvStoreMock.setItemRaw.mock.calls[0]?.[1]).toBe('calendar:2026-06-17-dark')
    expect(kvStoreMock.setItemRaw.mock.calls[1]?.[1]).toBe('calendar:2026-06-17')
  })

  it('carries the fetch size in the avatar key', async () => {
    await set(
      db,
      'avatar',
      { size: 120, email: 'a@b.c' },
      { status: AvatarStatus.HAVE_AVATAR, buffer: Buffer.from('x') },
    )

    expect(kvStoreMock.setItemRaw.mock.calls[0]?.[1]).toBe('avatar:120:a@b.c')
  })

  it('hashes the search key parts', async () => {
    await set(db, 'searchResult', { generation: 7, parts: ['foo'] }, ['a'])
    const searchKey = kvStoreMock.setItem.mock.calls[0]?.[1] as string
    expect(searchKey).toMatch(/^search-result:7:[0-9a-f]{64}$/)
  })
})

describe('cache registry — avatar sentinel codec', () => {
  it('encodes a present avatar as sentinel byte 0 + payload', async () => {
    await set(
      db,
      'avatar',
      { size: 80, email: 'a@b.c' },
      { status: AvatarStatus.HAVE_AVATAR, buffer: Buffer.from('png') },
    )

    const blob = kvStoreMock.setItemRaw.mock.calls[0]?.[2] as Buffer
    expect(blob[0]).toBe(AvatarStatus.HAVE_AVATAR)
    expect(blob.subarray(1).toString()).toBe('png')
  })

  it('encodes a missing avatar as the lone sentinel byte 1', async () => {
    await set(db, 'avatar', { size: 80, email: 'a@b.c' }, { status: AvatarStatus.NO_AVATAR, buffer: null })

    const blob = kvStoreMock.setItemRaw.mock.calls[0]?.[2] as Buffer
    expect(blob).toEqual(Buffer.from([AvatarStatus.NO_AVATAR]))
  })

  it('treats a HAVE_AVATAR entry with a null buffer as the negative sentinel', async () => {
    // The codec refuses to write a payload-less positive entry — a corrupt
    // in-memory shape degrades to the negative sentinel instead of an
    // undecodable blob.
    await set(db, 'avatar', { size: 80, email: 'a@b.c' }, { status: AvatarStatus.HAVE_AVATAR, buffer: null })

    const blob = kvStoreMock.setItemRaw.mock.calls[0]?.[2] as Buffer
    expect(blob).toEqual(Buffer.from([AvatarStatus.NO_AVATAR]))
  })

  it('round-trips both sentinel forms through get', async () => {
    kvStoreMock.getItemRaw.mockResolvedValueOnce(Buffer.from([AvatarStatus.NO_AVATAR]))
    await expect(get(db, 'avatar', { size: 80, email: 'a@b.c' })).resolves.toEqual({
      status: AvatarStatus.NO_AVATAR,
      buffer: null,
    })

    kvStoreMock.getItemRaw.mockResolvedValueOnce(
      Buffer.concat([Buffer.from([AvatarStatus.HAVE_AVATAR]), Buffer.from('png')]),
    )
    await expect(get(db, 'avatar', { size: 80, email: 'a@b.c' })).resolves.toEqual({
      status: AvatarStatus.HAVE_AVATAR,
      buffer: Buffer.from('png'),
    })
  })

  it('reads an unknown sentinel byte as a miss', async () => {
    kvStoreMock.getItemRaw.mockResolvedValueOnce(Buffer.from([7, 1, 2, 3]))
    await expect(get(db, 'avatar', { size: 80, email: 'a@b.c' })).resolves.toBeNull()
  })
})

describe('cache registry — get / set / remove / clear', () => {
  it('coalesces concurrent reads of the same key', async () => {
    kvStoreMock.getItem.mockResolvedValue({ found: false })

    const [a, b] = await Promise.all([
      get(db, 'imageMeta', { storagePath: 'x.png' }),
      get(db, 'imageMeta', { storagePath: 'x.png' }),
    ])

    expect(a).toEqual({ found: false })
    expect(b).toEqual({ found: false })
    expect(kvStoreMock.getItem).toHaveBeenCalledTimes(1)
    expect(kvStoreMock.getItem).toHaveBeenCalledWith(db, 'image-meta:x.png')
  })

  it('remove deletes the computed key', async () => {
    await remove(db, 'imageMeta', { storagePath: 'x.png' })

    expect(kvStoreMock.removeItem).toHaveBeenCalledWith(db, 'image-meta:x.png')
  })

  it('clear deletes by bucket column, not by prefix scan', async () => {
    const where = vi.fn().mockResolvedValue(undefined)
    const deleteFn = vi.fn(() => ({ where }))
    const dbMock = { delete: deleteFn } as unknown as Database

    await clear(dbMock, 'feed')

    expect(deleteFn).toHaveBeenCalledTimes(1)
    expect(where).toHaveBeenCalledTimes(1)
  })
})

describe('cache registry — throughMany', () => {
  it('returns entries in input order, loads misses, and writes them back', async () => {
    kvStoreMock.getItems.mockResolvedValue([
      { key: 'image-meta:a.png', value: { found: true, storagePath: 'a.png' } },
      { key: 'image-meta:b.png', value: null },
      { key: 'image-meta:c.png', value: null },
    ])
    const loader = vi.fn().mockResolvedValue([
      { params: { storagePath: 'b.png' }, value: { found: true, storagePath: 'b.png' } },
      { params: { storagePath: 'c.png' }, value: { found: false } },
    ])

    const result = await throughMany(
      db,
      'imageMeta',
      [{ storagePath: 'a.png' }, { storagePath: 'b.png' }, { storagePath: 'c.png' }],
      loader,
    )

    expect(kvStoreMock.getItems).toHaveBeenCalledWith(db, ['image-meta:a.png', 'image-meta:b.png', 'image-meta:c.png'])
    expect(loader).toHaveBeenCalledWith([{ storagePath: 'b.png' }, { storagePath: 'c.png' }])
    expect(result).toEqual([
      { params: { storagePath: 'a.png' }, value: { found: true, storagePath: 'a.png' } },
      { params: { storagePath: 'b.png' }, value: { found: true, storagePath: 'b.png' } },
      { params: { storagePath: 'c.png' }, value: { found: false } },
    ])
    expect(kvStoreMock.setItem).toHaveBeenCalledTimes(2)
    expect(kvStoreMock.setItem).toHaveBeenCalledWith(
      db,
      'image-meta:b.png',
      { found: true, storagePath: 'b.png' },
      { ttlSeconds: 3600, bucket: 'imageMeta' },
    )
    expect(kvStoreMock.setItem).toHaveBeenCalledWith(
      db,
      'image-meta:c.png',
      { found: false },
      { ttlSeconds: 3600, bucket: 'imageMeta' },
    )
  })

  it('returns null for misses the loader did not cover', async () => {
    const loader = vi.fn().mockResolvedValue([])

    const result = await throughMany(db, 'imageMeta', [{ storagePath: 'a.png' }], loader)

    expect(result).toEqual([{ params: { storagePath: 'a.png' }, value: null }])
    expect(kvStoreMock.setItem).not.toHaveBeenCalled()
  })
})

describe('cache registry — counters', () => {
  function counterDb(rows: unknown[]) {
    const limit = vi.fn(() => ({ all: () => rows }))
    const where = vi.fn(() => ({ limit }))
    const from = vi.fn(() => ({ where }))
    const select = vi.fn(() => ({ from }))
    const run = vi.fn()
    const onConflictDoUpdate = vi.fn(() => ({ run }))
    const values = vi.fn(() => ({ onConflictDoUpdate }))
    const insert = vi.fn(() => ({ values }))
    return { db: { select, insert } as unknown as Database, select, insert }
  }

  it('rejects buckets that declare no counter', () => {
    expect(() => getCounter(db, 'og')).toThrow("cache 'og' declares no counter")
    expect(() => bumpCounter(db, 'feed')).toThrow("cache 'feed' declares no counter")
  })

  it('memoizes the generation and refreshes it on bump', async () => {
    const { db: dbMock, select, insert } = counterDb([{ value: 7 }])

    await expect(getCounter(dbMock, 'searchResult')).resolves.toBe(7)
    await expect(getCounter(dbMock, 'searchResult')).resolves.toBe(7)
    expect(select).toHaveBeenCalledTimes(1)

    bumpCounter(dbMock, 'searchResult')
    expect(insert).toHaveBeenCalledTimes(1)
    await expect(getCounter(dbMock, 'searchResult')).resolves.toBe(8)
    // The bump itself re-reads the counter (read-modify-write).
    expect(select).toHaveBeenCalledTimes(2)
  })

  it('re-reads the counter after the test reset', async () => {
    const { db: dbMock, select } = counterDb([{ value: 42 }])

    await expect(getCounter(dbMock, 'searchResult')).resolves.toBe(42)
    __resetCacheCountersForTests()
    await expect(getCounter(dbMock, 'searchResult')).resolves.toBe(42)
    expect(select).toHaveBeenCalledTimes(2)
  })
})
