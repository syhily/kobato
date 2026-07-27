import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { Buffer } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { warnMock, imageWidthMock, cacheSetMock } = vi.hoisted(() => ({
  warnMock: vi.fn(),
  imageWidthMock: vi.fn(),
  cacheSetMock: vi.fn(),
}))
vi.mock('@/server/infra/logger', () => ({
  getLogger: () => ({ warn: warnMock }),
}))

vi.mock('@/server/infra/cache/registry', () => ({
  AvatarStatus: { HAVE_AVATAR: 0, NO_AVATAR: 1 },
  set: cacheSetMock,
}))

vi.mock('@/server/infra/image/compress', () => ({
  compressImage: (buf: Buffer) => Promise.resolve(buf),
  imageWidth: imageWidthMock,
}))

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import {
  defaultAvatarUrl,
  fetchAvatarImage,
  fetchGithubAvatarDataUrl,
  fetchQQAvatarImage,
  getQQAvatarUrl,
  isQQEmail,
  resolveAvatarForEmail,
  resolveAvatarSize,
} from '@/server/domains/comments/services/avatar'
import { setBlogSettingsBundleForTests } from '@/server/domains/settings/services/test-utils'

// The db handle is only forwarded to the mocked cache registry — a
// stand-in is enough for the unit scope.
const db = {} as NodePgDatabase

beforeEach(() => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  warnMock.mockClear()
  cacheSetMock.mockReset()
  cacheSetMock.mockResolvedValue(undefined)
  imageWidthMock.mockReset()
  // Default: upstream serves a large-enough image so the size guard passes.
  imageWidthMock.mockResolvedValue(512)
})

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
  afterEach(() => {
    vi.unstubAllGlobals()
  })

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
  })

  it('returns the compressed bytes on a 2xx response', async () => {
    const body = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    mockFetch([new Response(body, { status: 200, headers: { 'Content-Type': 'image/png' } })])
    const result = await withAllowedMirror(() => fetchAvatarImage('hash', 120))
    expect(result).not.toBeNull()
  })

  it('returns null when the mirror redirects to the default avatar URL', async () => {
    const defaultUrl = defaultAvatarUrl()
    mockFetch([new Response(null, { status: 302, headers: { location: defaultUrl } })])
    expect(await withAllowedMirror(() => fetchAvatarImage('hash', 120))).toBeNull()
  })

  it('returns null when the upstream image is narrower than the requested size (inline placeholder)', async () => {
    imageWidthMock.mockResolvedValue(24)
    const body = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    mockFetch([new Response(body, { status: 200, headers: { 'Content-Type': 'image/png' } })])
    expect(await withAllowedMirror(() => fetchAvatarImage('hash', 120))).toBeNull()
  })

  it('accepts an upstream image at exactly the requested size', async () => {
    imageWidthMock.mockResolvedValue(120)
    const body = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    mockFetch([new Response(body, { status: 200, headers: { 'Content-Type': 'image/png' } })])
    expect(await withAllowedMirror(() => fetchAvatarImage('hash', 120))).not.toBeNull()
  })

  it('returns null when the upstream body is not a decodable image', async () => {
    imageWidthMock.mockResolvedValue(undefined)
    const body = Buffer.from('<html>not an image</html>')
    mockFetch([new Response(body, { status: 200 })])
    expect(await withAllowedMirror(() => fetchAvatarImage('hash', 120))).toBeNull()
  })

  it('follows a non-default redirect', async () => {
    const body = Buffer.from([0x89, 0x50])
    mockFetch([
      new Response(null, { status: 302, headers: { location: 'https://gravatar.com/avatar/real?d=x' } }),
      new Response(body, { status: 200 }),
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
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null for non-QQ emails without calling fetch', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    expect(await fetchQQAvatarImage('a@b.com', 120)).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })

  it('returns bytes on a 2xx response', async () => {
    const body = Buffer.from([0xff, 0xd8])
    mockFetch([new Response(body, { status: 200 })])
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
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves a non-QQ email to its hash without fetching or warming the cache', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)

    const hash = await resolveAvatarForEmail(db, 'someone@example.com')

    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(spy).not.toHaveBeenCalled()
    expect(cacheSetMock).not.toHaveBeenCalled()
  })

  it('pre-warms a HAVE_AVATAR entry at the default size when the QQ fetch succeeds', async () => {
    const body = Buffer.from([0xff, 0xd8])
    mockFetch([new Response(body, { status: 200 })])

    const hash = await resolveAvatarForEmail(db, '12345@qq.com')

    expect(cacheSetMock).toHaveBeenCalledWith(
      db,
      'avatar',
      { size: 120, email: hash },
      { status: 0, buffer: expect.any(Buffer) },
    )
  })

  it('pre-warms the NO_AVATAR sentinel when the QQ upstream has no avatar', async () => {
    mockFetch([new Response(null, { status: 404 })])

    const hash = await resolveAvatarForEmail(db, '12345@qq.com')

    expect(cacheSetMock).toHaveBeenCalledWith(db, 'avatar', { size: 120, email: hash }, { status: 1, buffer: null })
  })
})
