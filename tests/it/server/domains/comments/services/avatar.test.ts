import { Buffer } from 'node:buffer'
import sharp from 'sharp'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '@/server/infra/db/database'

const { warnMock } = vi.hoisted(() => ({
  warnMock: vi.fn(),
}))
// The logger stays mocked so the "degrade to the default avatar" warn
// paths are assertable; every other dependency below is real — the
// in-memory SQLite engine, the DB-backed kv cache registry, and real
// sharp image processing.
vi.mock('@/server/infra/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/infra/logger')>()
  return {
    ...actual,
    getLogger: () => ({ warn: warnMock, info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  }
})

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, closeTestDatabase, createTestDatabase } from '#/_helpers/integration-db'
import {
  defaultAvatarUrl,
  fetchAvatarImage,
  fetchGithubAvatarDataUrl,
  fetchQQAvatarImage,
  getQQAvatarUrl,
  isQQEmail,
  resolveAvatarForEmail,
  resolveAvatarSize,
  serveAvatar,
} from '@/server/domains/comments/services/avatar'
import { type AvatarEntry, AvatarStatus, get, set } from '@/server/infra/cache/registry'
import { user } from '@/server/infra/db/schema/user'
import { imageWidth } from '@/server/infra/image/compress'
import { DEFAULT_AVATAR_SIZE } from '@/shared/utils/avatar'
import { encodedEmail } from '@/shared/utils/security'

const handle = createTestDatabase()
const db: Database = handle.db

afterAll(() => {
  closeTestDatabase(handle)
})

beforeEach(async () => {
  await clearAllTables(db)
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  warnMock.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** A real square PNG — the upstream fixtures are decoded by real sharp,
 *  so the Postgres-era fake magic-byte buffers are gone. */
async function pngOfSize(width: number): Promise<Buffer> {
  return sharp({ create: { width, height: width, channels: 3, background: { r: 32, g: 128, b: 200 } } })
    .png()
    .toBuffer()
}

async function seedUser(opts: Partial<typeof user.$inferInsert> = {}): Promise<number> {
  const rows = await db
    .insert(user)
    .values({
      name: opts.name ?? 'Alice',
      email: opts.email ?? `alice-${Math.random().toString(36).slice(2)}@example.com`,
      password: 'hashed',
      ...opts,
    })
    .returning({ id: user.id })
  return rows[0]!.id
}

function withAllowedMirror<T>(fn: () => Promise<T>): Promise<T> {
  const comments = TEST_BLOG_SETTINGS_BUNDLE.comments!
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    comments: {
      comments: {
        ...comments.comments,
        avatar: { ...comments.comments.avatar, mirror: 'https://gravatar.com/avatar/' },
      },
    },
  })
  return fn()
}

function mockFetch(responses: Array<Response | (() => Response)>) {
  let i = 0
  const fn = vi.fn(async () => {
    const r = responses[i]
    i += 1
    return typeof r === 'function' ? r() : (r ?? new Response(null, { status: 404 }))
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

/** Read the real kv_cache-backed avatar entry the service wrote. */
async function cachedAvatar(size: number, email: string): Promise<AvatarEntry | null> {
  return get<'avatar', AvatarEntry>(db, 'avatar', { size, email })
}

describe('domains/comments/services/avatar — resolveAvatarSize', () => {
  it('defaults to 120 when the parameter is absent, blank, or not a number', () => {
    expect(resolveAvatarSize(undefined)).toBe(120)
    expect(resolveAvatarSize('')).toBe(120)
    expect(resolveAvatarSize('  ')).toBe(120)
    expect(resolveAvatarSize('abc')).toBe(120)
    expect(resolveAvatarSize('Infinity')).toBe(120)
  })

  it('passes through an in-range integer', () => {
    expect(resolveAvatarSize('120')).toBe(120)
    expect(resolveAvatarSize('48')).toBe(48)
  })

  it('truncates floats and clamps to 16..512', () => {
    expect(resolveAvatarSize('119.9')).toBe(119)
    expect(resolveAvatarSize('1')).toBe(16)
    expect(resolveAvatarSize('-5')).toBe(16)
    expect(resolveAvatarSize('10000')).toBe(512)
  })
})

describe('domains/comments/services/avatar — isQQEmail / getQQAvatarUrl', () => {
  it('detects QQ emails', () => {
    expect(isQQEmail('12345@qq.com')).toBe(true)
    expect(isQQEmail('12345@qq.COM')).toBe(true)
    expect(isQQEmail('a@b.com')).toBe(false)
    expect(isQQEmail('not-email')).toBe(false)
  })

  it('returns null for non-QQ emails', () => {
    expect(getQQAvatarUrl('a@b.com', 80)).toBeNull()
  })

  it('builds the QQ avatar URL from the numeric uin', () => {
    expect(getQQAvatarUrl('12345@qq.com', 80)).toContain('dst_uin=12345')
  })

  it('picks spec=4 for sizes up to 100 and spec=5 above', () => {
    expect(getQQAvatarUrl('12345@qq.com', 100)).toContain('spec=4')
    expect(getQQAvatarUrl('12345@qq.com', 80)).toContain('spec=4')
    expect(getQQAvatarUrl('12345@qq.com', 101)).toContain('spec=5')
    expect(getQQAvatarUrl('12345@qq.com', 512)).toContain('spec=5')
  })
})

describe('domains/comments/services/avatar — defaultAvatarUrl', () => {
  it('joins the site website with the default avatar path', () => {
    const url = defaultAvatarUrl()
    expect(url).toMatch(/images\/default-avatar\.png$/)
    expect(url.startsWith('http')).toBe(true)
  })
})

describe('domains/comments/services/avatar — fetchAvatarImage', () => {
  it('returns null when the mirror is not on the SSRF allowlist', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const comments = TEST_BLOG_SETTINGS_BUNDLE.comments!
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      comments: {
        comments: {
          ...comments.comments,
          avatar: { ...comments.comments.avatar, mirror: 'https://evil.example/avatar' },
        },
      },
    })
    expect(await fetchAvatarImage('abc', 120)).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(warnMock).toHaveBeenCalledWith('avatar mirror url rejected by ssrf guard')
  })

  it('returns the compressed bytes on a 2xx response', async () => {
    const body = await pngOfSize(512)
    mockFetch([new Response(new Uint8Array(body), { status: 200, headers: { 'Content-Type': 'image/png' } })])
    const result = await withAllowedMirror(() => fetchAvatarImage('hash', 120))
    expect(result).not.toBeNull()
    // Real sharp round-trip: the compressed payload stays a 512px image.
    expect(await imageWidth(result!)).toBe(512)
  })

  it('returns null when the mirror redirects to the default avatar URL', async () => {
    const defaultUrl = defaultAvatarUrl()
    mockFetch([new Response(null, { status: 302, headers: { location: defaultUrl } })])
    expect(await withAllowedMirror(() => fetchAvatarImage('hash', 120))).toBeNull()
  })

  it('returns null when the upstream image is narrower than the requested size (inline placeholder)', async () => {
    const body = await pngOfSize(24)
    mockFetch([new Response(new Uint8Array(body), { status: 200, headers: { 'Content-Type': 'image/png' } })])
    expect(await withAllowedMirror(() => fetchAvatarImage('hash', 120))).toBeNull()
  })

  it('accepts an upstream image at exactly the requested size', async () => {
    const body = await pngOfSize(120)
    mockFetch([new Response(new Uint8Array(body), { status: 200, headers: { 'Content-Type': 'image/png' } })])
    expect(await withAllowedMirror(() => fetchAvatarImage('hash', 120))).not.toBeNull()
  })

  it('returns null when the upstream body is not a decodable image', async () => {
    const body = Buffer.from('<html>not an image</html>')
    mockFetch([new Response(new Uint8Array(body), { status: 200 })])
    expect(await withAllowedMirror(() => fetchAvatarImage('hash', 120))).toBeNull()
  })

  it('follows a non-default redirect', async () => {
    const body = await pngOfSize(512)
    mockFetch([
      new Response(null, { status: 302, headers: { location: 'https://gravatar.com/avatar/real?d=x' } }),
      new Response(new Uint8Array(body), { status: 200 }),
    ])
    expect(await withAllowedMirror(() => fetchAvatarImage('hash', 120))).not.toBeNull()
  })

  it('rejects a redirect to an internal address (SSRF)', async () => {
    const fetchFn = mockFetch([
      new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } }),
    ])
    expect(await withAllowedMirror(() => fetchAvatarImage('hash', 120))).toBeNull()
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('returns null on a 4xx response', async () => {
    mockFetch([new Response(null, { status: 404 })])
    expect(await withAllowedMirror(() => fetchAvatarImage('hash', 120))).toBeNull()
  })

  it('returns null when a 3xx response has no location header', async () => {
    mockFetch([new Response(null, { status: 302 })])
    expect(await withAllowedMirror(() => fetchAvatarImage('hash', 120))).toBeNull()
  })

  it('returns null when fetch throws a network error', async () => {
    mockFetch([
      () => {
        throw new TypeError('fetch failed', { cause: new AggregateError([], 'ETIMEDOUT') })
      },
    ])
    expect(await withAllowedMirror(() => fetchAvatarImage('hash', 120))).toBeNull()
    expect(warnMock).toHaveBeenCalledWith('avatar fetch failed', { error: 'fetch failed' })
  })
})

describe('domains/comments/services/avatar — fetchQQAvatarImage', () => {
  it('returns null for non-QQ emails without calling fetch', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    expect(await fetchQQAvatarImage('a@b.com', 120)).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })

  it('returns bytes on a 2xx response', async () => {
    const body = await pngOfSize(100)
    mockFetch([new Response(new Uint8Array(body), { status: 200 })])
    expect(await fetchQQAvatarImage('12345@qq.com', 120)).not.toBeNull()
  })

  it('returns null on a non-2xx response', async () => {
    mockFetch([new Response(null, { status: 500 })])
    expect(await fetchQQAvatarImage('12345@qq.com', 120)).toBeNull()
  })

  it('returns null when fetch throws a network error', async () => {
    mockFetch([
      () => {
        throw new TypeError('fetch failed', { cause: new AggregateError([], 'ETIMEDOUT') })
      },
    ])
    expect(await fetchQQAvatarImage('12345@qq.com', 120)).toBeNull()
    expect(warnMock).toHaveBeenCalledWith('avatar fetch failed', { error: 'fetch failed' })
  })

  it('rejects a redirect response instead of following it', async () => {
    const fetchFn = mockFetch([
      new Response(null, { status: 302, headers: { location: 'https://evil.example/avatar.png' } }),
    ])
    expect(await fetchQQAvatarImage('12345@qq.com', 120)).toBeNull()
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
})

describe('domains/comments/services/avatar — fetchGithubAvatarDataUrl (sunk from github.controller)', () => {
  it('inlines the upstream bytes as a base64 data URL with the upstream content type', async () => {
    mockFetch([
      new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer, {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }),
    ])

    const dataUrl = await fetchGithubAvatarDataUrl()

    // PNG magic bytes → 'iVBORw==' in base64.
    expect(dataUrl).toBe('data:image/png;base64,iVBORw==')
  })

  it('defaults the content type to image/png when the upstream omits the header', async () => {
    mockFetch([new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200 })])

    expect(await fetchGithubAvatarDataUrl()).toMatch(/^data:image\/png;base64,/)
  })

  it('resolves to an empty string when the upstream is not ok', async () => {
    mockFetch([new Response('not found', { status: 404 })])

    expect(await fetchGithubAvatarDataUrl()).toBe('')
  })
})

describe('domains/comments/services/avatar — resolveAvatarForEmail', () => {
  it('resolves a non-QQ email to its hash without fetching or warming the cache', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)

    const hash = await resolveAvatarForEmail(db, 'someone@example.com')

    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(spy).not.toHaveBeenCalled()
    // Real cache: nothing was written for any size.
    expect(await cachedAvatar(DEFAULT_AVATAR_SIZE, hash)).toBeNull()
  })

  it('pre-warms a HAVE_AVATAR entry at the default size when the QQ fetch succeeds', async () => {
    const body = await pngOfSize(100)
    mockFetch([new Response(new Uint8Array(body), { status: 200 })])

    const hash = await resolveAvatarForEmail(db, '12345@qq.com')

    const entry = await cachedAvatar(DEFAULT_AVATAR_SIZE, hash)
    expect(entry?.status).toBe(AvatarStatus.HAVE_AVATAR)
    expect(entry?.buffer).toBeInstanceOf(Buffer)
  })

  it('pre-warms the NO_AVATAR sentinel when the QQ upstream has no avatar', async () => {
    mockFetch([new Response(null, { status: 404 })])

    const hash = await resolveAvatarForEmail(db, '12345@qq.com')

    expect(await cachedAvatar(DEFAULT_AVATAR_SIZE, hash)).toEqual({
      status: AvatarStatus.NO_AVATAR,
      buffer: null,
    })
  })
})

describe('domains/comments/services/avatar — serveAvatar', () => {
  it('writes a negative entry and redirects when the hash resolves to no user', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    // Numeric id with no user row: nothing to ask upstream, so the raw
    // param itself keys the negative entry.
    const result = await serveAvatar(db, '42', 120)

    expect(result).toEqual({ kind: 'redirect' })
    expect(await cachedAvatar(120, '42')).toEqual({ status: AvatarStatus.NO_AVATAR, buffer: null })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('serves a QQ hit as png and overwrites a stale cache entry — the QQ policy never reads the cache', async () => {
    const id = await seedUser({ email: '12345@qq.com' })
    const hash = await encodedEmail('12345@qq.com')
    // Pre-warm a stale positive entry: a read-through policy would serve
    // it without ever calling the upstream.
    const stale = Buffer.from('stale-bytes')
    await set(db, 'avatar', { size: 120, email: hash }, { status: AvatarStatus.HAVE_AVATAR, buffer: stale })
    const fetchFn = mockFetch([new Response(new Uint8Array(await pngOfSize(100)), { status: 200 })])

    const result = await serveAvatar(db, String(id), 120)

    expect(result.kind).toBe('png')
    expect(fetchFn).toHaveBeenCalledTimes(1)
    if (result.kind === 'png') {
      expect(result.buffer.equals(stale)).toBe(false)
      // The cache was overwritten with the freshly fetched bytes.
      const entry = await cachedAvatar(120, hash)
      expect(entry?.status).toBe(AvatarStatus.HAVE_AVATAR)
      expect(entry?.buffer?.equals(result.buffer)).toBe(true)
    }
  })

  it('overwrites the cache with a negative entry and redirects on a QQ miss', async () => {
    const id = await seedUser({ email: '12345@qq.com' })
    mockFetch([new Response(null, { status: 404 })])

    const result = await serveAvatar(db, String(id), 120)

    expect(result).toEqual({ kind: 'redirect' })
    const hash = await encodedEmail('12345@qq.com')
    expect(await cachedAvatar(120, hash)).toEqual({ status: AvatarStatus.NO_AVATAR, buffer: null })
  })

  it('serves a gravatar cache hit as png without fetching upstream', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    await set(
      db,
      'avatar',
      { size: 120, email: 'abc' },
      { status: AvatarStatus.HAVE_AVATAR, buffer: Buffer.from('av') },
    )

    const result = await serveAvatar(db, 'abc', 120)

    expect(result).toEqual({ kind: 'png', buffer: Buffer.from('av') })
    expect(spy).not.toHaveBeenCalled()
  })

  it('redirects on a gravatar negative-cache entry without fetching upstream', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    await set(db, 'avatar', { size: 120, email: 'abc' }, { status: AvatarStatus.NO_AVATAR, buffer: null })

    const result = await serveAvatar(db, 'abc', 120)

    expect(result).toEqual({ kind: 'redirect' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('writes a negative entry and redirects when the gravatar fetch misses', async () => {
    mockFetch([new Response(null, { status: 404 })])

    const result = await withAllowedMirror(() => serveAvatar(db, 'abc', 120))

    expect(result).toEqual({ kind: 'redirect' })
    expect(await cachedAvatar(120, 'abc')).toEqual({ status: AvatarStatus.NO_AVATAR, buffer: null })
  })

  it('serves the fetched bytes and caches HAVE_AVATAR on a gravatar fetch hit', async () => {
    mockFetch([new Response(new Uint8Array(await pngOfSize(512)), { status: 200 })])

    const result = await withAllowedMirror(() => serveAvatar(db, 'abc', 120))

    expect(result.kind).toBe('png')
    if (result.kind === 'png') {
      const entry = await cachedAvatar(120, 'abc')
      expect(entry?.status).toBe(AvatarStatus.HAVE_AVATAR)
      expect(entry?.buffer?.equals(result.buffer)).toBe(true)
    }
  })

  it('persists a HAVE_AVATAR entry with a null buffer as NO_AVATAR and redirects without fetching', async () => {
    // The avatar codec normalizes a payload-less positive to the negative
    // sentinel byte (encodeAvatar), so the mocked-unit-test "null buffer
    // treated as a miss, refetch upstream" scenario cannot be persisted:
    // the entry reads back as NO_AVATAR and short-circuits.
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    await set(db, 'avatar', { size: 120, email: 'abc' }, { status: AvatarStatus.HAVE_AVATAR, buffer: null })

    const result = await withAllowedMirror(() => serveAvatar(db, 'abc', 120))

    expect(result).toEqual({ kind: 'redirect' })
    expect(spy).not.toHaveBeenCalled()
  })
})
