import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  bumpGeneration,
  clearBucketEntries,
  countEntryFiles,
  getItemRawWithExpiry,
  getItemsWithExpiry,
  getItemWithExpiry,
  readGeneration,
  removeItem,
  resolveCacheRoot,
  setItem,
  setItemRaw,
  statBucket,
  wipeCache,
} from '@/server/infra/cache/file-store'

// Test-local mirror of the documented layout: bucket/<h[0:2]>/<h[2:]>.
function expectedEntryPath(bucket: string, fullKey: string): string {
  const digest = createHash('sha256').update(fullKey, 'utf8').digest('hex')
  return path.join(resolveCacheRoot(), bucket, digest.slice(0, 2), digest.slice(2))
}

function bucketPath(bucket: string): string {
  return path.join(resolveCacheRoot(), bucket)
}

async function listFiles(dir: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const files: string[] = []
  for (const entry of entries) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listFiles(abs)))
    } else {
      files.push(abs)
    }
  }
  return files
}

describe('cache root', () => {
  it('isolates the in-memory test runtime in a private temp dir and ignores KOBATO_CACHE_DIR', async () => {
    const nativesDir = path.join(tmpdir(), `kobato-natives-${process.pid}-${Date.now()}`)
    const previous = process.env.KOBATO_CACHE_DIR
    process.env.KOBATO_CACHE_DIR = nativesDir
    try {
      await setItem('feed', 'feed:kobato-cache-dir', 1)
      const root = resolveCacheRoot()
      expect(path.basename(root)).toMatch(/^kobato-cache-/)
      expect(root.startsWith(nativesDir)).toBe(false)
      await expect(stat(nativesDir)).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      if (previous === undefined) {
        delete process.env.KOBATO_CACHE_DIR
      } else {
        process.env.KOBATO_CACHE_DIR = previous
      }
    }
  })

  it('rejects bucket ids that could escape the cache root', async () => {
    await expect(setItem('../escape', 'key', 1)).rejects.toThrow(TypeError)
    await expect(getItemWithExpiry('a/b', 'key')).rejects.toThrow(TypeError)
  })
})

describe('roundtrip', () => {
  it('round-trips JSON payloads, returns the stored text, and reports misses as null', async () => {
    const value = { title: 'Kobato 小鸟', tags: ['a', null, 3], nested: { ok: true } }
    const text = await setItem('feed', 'feed:xml:en:1:home', value)
    expect(text).toBe(JSON.stringify(value))
    await expect(getItemWithExpiry<typeof value>('feed', 'feed:xml:en:1:home')).resolves.toEqual({
      value,
      expiresAtMs: 0,
    })
    await expect(getItemWithExpiry('feed', 'feed:xml:en:1:missing')).resolves.toBeNull()
  })

  it('round-trips raw binary payloads byte-for-byte', async () => {
    const payload = Buffer.from([0, 255, 1, 254, 0x4b, 0x42, 0x43])
    await setItemRaw('og', 'og:card:example', payload)
    const stored = await getItemRawWithExpiry('og', 'og:card:example')
    expect(stored?.expiresAtMs).toBe(0)
    expect(Buffer.compare(stored!.value, payload)).toBe(0)
    await expect(getItemRawWithExpiry('og', 'og:card:missing')).resolves.toBeNull()
  })
})

describe('expiry', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('exposes the absolute deadline and expires lazily on the exact instant', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    await setItem('calendar', 'calendar:ttl', { day: 1 }, { ttlSeconds: 5 })

    const stored = await getItemWithExpiry('calendar', 'calendar:ttl')
    expect(stored?.expiresAtMs).toBe(Date.parse('2026-01-01T00:00:05.000Z'))

    vi.setSystemTime(new Date('2026-01-01T00:00:04.999Z'))
    await expect(getItemWithExpiry('calendar', 'calendar:ttl')).resolves.toMatchObject({ value: { day: 1 } })

    vi.setSystemTime(new Date('2026-01-01T00:00:05.000Z'))
    await expect(getItemWithExpiry('calendar', 'calendar:ttl')).resolves.toBeNull()
    await expect(stat(expectedEntryPath('calendar', 'calendar:ttl'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('never expires an entry written without a TTL', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    await setItem('githubRelease', 'githubRelease:owner/repo', { tag: 'v1' })

    vi.setSystemTime(new Date('2027-01-01T00:00:00.000Z'))
    await expect(getItemWithExpiry('githubRelease', 'githubRelease:owner/repo')).resolves.toMatchObject({
      value: { tag: 'v1' },
      expiresAtMs: 0,
    })
  })

  it('accepts an absolute deadline that wins over ttlSeconds', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const deadline = Date.now() + 10_000
    await setItem('calendar', 'calendar:deadline', { day: 2 }, { expiresAtMs: deadline, ttlSeconds: 3600 })

    await expect(getItemWithExpiry('calendar', 'calendar:deadline')).resolves.toEqual({
      value: { day: 2 },
      expiresAtMs: deadline,
    })

    vi.setSystemTime(new Date(deadline))
    await expect(getItemWithExpiry('calendar', 'calendar:deadline')).resolves.toBeNull()
  })
})

describe('envelope validation', () => {
  it('treats a bad magic as a miss and evicts the file', async () => {
    const key = 'avatar:96:someone'
    await setItem('avatar', key, { status: 0 })
    const file = expectedEntryPath('avatar', key)
    await writeFile(file, Buffer.concat([Buffer.from('KBC2'), Buffer.alloc(8), Buffer.from('{}')]))

    await expect(getItemWithExpiry('avatar', key)).resolves.toBeNull()
    await expect(stat(file)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('treats a short header as a miss and evicts the file', async () => {
    const key = 'githubAvatar:all'
    await setItem('githubAvatar', key, { avatar: true })
    const file = expectedEntryPath('githubAvatar', key)
    await writeFile(file, Buffer.from('KBC1'))

    await expect(getItemWithExpiry('githubAvatar', key)).resolves.toBeNull()
    await expect(stat(file)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('propagates real payload errors to the caller', async () => {
    await setItemRaw('imageMeta', 'image-meta:not-json', Buffer.from('not json'))
    await expect(getItemWithExpiry('imageMeta', 'image-meta:not-json')).rejects.toThrow(SyntaxError)
  })
})

describe('getItemsWithExpiry', () => {
  it('preserves input order and reports missing keys as null entries', async () => {
    await setItem('searchResult', 'search:b', { id: 'b' })
    await setItem('searchResult', 'search:a', { id: 'a' })

    const entries = await getItemsWithExpiry('searchResult', ['search:b', 'search:missing', 'search:a', 'search:b'])
    expect(entries.map((entry) => entry.key)).toEqual(['search:b', 'search:missing', 'search:a', 'search:b'])
    expect(entries.map((entry) => entry.entry?.value ?? null)).toEqual([{ id: 'b' }, null, { id: 'a' }, { id: 'b' }])
    await expect(getItemsWithExpiry('searchResult', [])).resolves.toEqual([])
  })
})

describe('removeItem', () => {
  it('treats a missing entry as a successful no-op', async () => {
    await expect(removeItem('tags', 'tags:never-written')).resolves.toBeUndefined()
  })

  it('removes an existing entry and is idempotent', async () => {
    await setItem('tags', 'tags:all', { tags: [] })
    await removeItem('tags', 'tags:all')
    await expect(getItemWithExpiry('tags', 'tags:all')).resolves.toBeNull()
    await expect(removeItem('tags', 'tags:all')).resolves.toBeUndefined()
  })
})

describe('write mechanics', () => {
  it('publishes only through rename, leaving no tmp file behind', async () => {
    const key = 'sitemap:xml'
    await setItem('sitemap', key, { urls: [] })

    const file = expectedEntryPath('sitemap', key)
    expect((await stat(file)).isFile()).toBe(true)
    await expect(readdir(path.join(bucketPath('sitemap'), '_tmp'))).resolves.toEqual([])

    const segments = path.relative(bucketPath('sitemap'), file).split(path.sep)
    expect(segments).toHaveLength(2)
    expect(segments[0]).toMatch(/^[0-9a-f]{2}$/)
    expect(segments[1]).toMatch(/^[0-9a-f]{62}$/)
  })

  it('hashes keys so key material never reaches a path', async () => {
    const key = 'avatar:96:someone@example.com'
    await setItem('avatar', key, { status: 1 })
    const file = expectedEntryPath('avatar', key)

    for (const segment of path.relative(resolveCacheRoot(), file).split(path.sep)) {
      expect(segment).not.toContain('someone')
      expect(segment).not.toContain('@')
      expect(segment).not.toContain('example.com')
    }
    expect(path.basename(file)).toMatch(/^[0-9a-f]{62}$/)
  })
})

describe('generation counter and counter-bucket clear', () => {
  beforeEach(async () => {
    // This bucket is shared with the expiry cases above; start it cold.
    await rm(bucketPath('githubRelease'), { recursive: true, force: true })
  })

  it('bumps monotonically and reads 0 for a missing or corrupt file', async () => {
    await expect(readGeneration('githubRelease')).resolves.toBe(0)

    expect(bumpGeneration('githubRelease')).toBe(1)
    expect(bumpGeneration('githubRelease')).toBe(2)
    await expect(readGeneration('githubRelease')).resolves.toBe(2)

    await writeFile(path.join(resolveCacheRoot(), 'githubRelease', '_generation'), 'not-a-number')
    await expect(readGeneration('githubRelease')).resolves.toBe(0)
  })

  it('clears entries while preserving the bumped generation file', async () => {
    await setItem('githubRelease', 'release:0:stale', ['stale'])
    expect(bumpGeneration('githubRelease')).toBe(1)
    await setItem('githubRelease', 'release:1:fresh', ['fresh'])

    expect(await clearBucketEntries('githubRelease')).toBe(2)
    await expect(countEntryFiles('githubRelease')).resolves.toBe(0)
    await expect(readGeneration('githubRelease')).resolves.toBe(1)
  })
})

describe('statBucket', () => {
  it('counts live entries but sums every shard file, including expired and malformed ones', async () => {
    await rm(bucketPath('githubRelease'), { recursive: true, force: true })
    const liveKey = 'probe:live'
    const expiredKey = 'probe:expired'
    const badKey = 'probe:bad'
    await setItem('githubRelease', liveKey, { ok: true }, { ttlSeconds: 3600 })
    await setItem('githubRelease', expiredKey, { ok: false }, { ttlSeconds: -1 })
    await setItem('githubRelease', badKey, { ok: 'overwritten' })
    await writeFile(expectedEntryPath('githubRelease', badKey), Buffer.from('XXXX12345678garbage'))

    // Neither the generation file nor _tmp are entry files.
    const bucketDir = path.join(resolveCacheRoot(), 'githubRelease')
    await writeFile(path.join(bucketDir, '_generation'), '7')
    await mkdir(path.join(bucketDir, '_tmp'), { recursive: true })
    await writeFile(path.join(bucketDir, '_tmp', 'orphan.tmp'), 'x')

    const entryPaths = [liveKey, expiredKey, badKey].map((key) => expectedEntryPath('githubRelease', key))
    const expectedBytes = (await Promise.all(entryPaths.map(async (file) => (await stat(file)).size))).reduce(
      (sum, size) => sum + size,
      0,
    )

    const usage = await statBucket('githubRelease')
    expect(usage.keyCount).toBe(1)
    expect(usage.byteSize).toBe(expectedBytes)
  })
})

describe('bucket clear races', () => {
  it('survives a bucket dir vanishing between operations', async () => {
    const key = 'comments:all'
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    try {
      await setItem('comments', key, { limit: 5 })
      await rm(bucketPath('comments'), { recursive: true, force: true })

      await expect(getItemWithExpiry('comments', key)).resolves.toBeNull()
      // The write recreates the bucket tree instead of assuming it survived.
      await expect(setItem('comments', key, { limit: 5 })).resolves.toBe('{"limit":5}')
      await expect(getItemWithExpiry('comments', key)).resolves.toMatchObject({ value: { limit: 5 } })
      await expect(removeItem('comments', 'comments:never-written')).resolves.toBeUndefined()

      await new Promise((resolve) => setImmediate(resolve))
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
    expect(unhandled).toEqual([])
    expect(await listFiles(bucketPath('comments'))).toHaveLength(1)
  })
})

describe('wipeCache', () => {
  it('removes and recreates the cache root with no entries left behind', async () => {
    await setItem('feed', 'wipe:feed', 'value', { ttlSeconds: 3600 })
    await setItemRaw('og', 'wipe:og', Buffer.from('png'), { ttlSeconds: 3600 })
    await writeFile(path.join(resolveCacheRoot(), 'feed', '_generation'), '3')
    await mkdir(path.join(resolveCacheRoot(), 'feed.trash-orphan'), { recursive: true })

    await wipeCache()

    expect((await stat(resolveCacheRoot())).isDirectory()).toBe(true)
    await expect(countEntryFiles('feed')).resolves.toBe(0)
    await expect(countEntryFiles('og')).resolves.toBe(0)
    await expect(readGeneration('feed')).resolves.toBe(0)
  })
})

afterAll(async () => {
  for (const bucket of [
    'feed',
    'og',
    'calendar',
    'githubRelease',
    'avatar',
    'githubAvatar',
    'imageMeta',
    'searchResult',
    'tags',
    'sitemap',
    'comments',
  ]) {
    await rm(bucketPath(bucket), { recursive: true, force: true })
  }
  await rm(resolveCacheRoot(), { recursive: true, force: true })
})
