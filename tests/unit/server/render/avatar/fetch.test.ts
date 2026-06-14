import { Buffer } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/server/render/image-compress', () => ({
  compressImage: (buf: Buffer) => Promise.resolve(buf),
}))

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { setBlogSettingsBundleForTests } from '@/server/domains/settings/services/test-utils'
import {
  defaultAvatarUrl,
  fetchAvatarImage,
  fetchQQAvatarImage,
  getQQAvatarUrl,
  isQQEmail,
} from '@/server/render/avatar/fetch'

beforeEach(() => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
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

describe('render/avatar/fetch — isQQEmail / getQQAvatarUrl', () => {
  it('detects QQ emails', () => {
    expect(isQQEmail('12345@qq.com')).toBe(true)
    expect(isQQEmail('12345@qq.COM')).toBe(true)
    expect(isQQEmail('a@b.com')).toBe(false)
    expect(isQQEmail('not-email')).toBe(false)
  })

  it('returns null for non-QQ emails', () => {
    expect(getQQAvatarUrl('a@b.com')).toBeNull()
  })

  it('builds the QQ avatar URL from the numeric uin', () => {
    expect(getQQAvatarUrl('12345@qq.com')).toContain('dst_uin=12345')
  })
})

describe('render/avatar/fetch — defaultAvatarUrl', () => {
  it('joins the site website with the default avatar path', () => {
    const url = defaultAvatarUrl()
    expect(url).toMatch(/images\/default-avatar\.png$/)
    expect(url.startsWith('http')).toBe(true)
  })
})

describe('render/avatar/fetch — fetchAvatarImage', () => {
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
    expect(await fetchAvatarImage('abc')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns the compressed bytes on a 2xx response', async () => {
    const body = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    mockFetch([new Response(body, { status: 200, headers: { 'Content-Type': 'image/png' } })])
    const result = await withAllowedMirror(() => fetchAvatarImage('hash'))
    expect(result).not.toBeNull()
  })

  it('returns null when the mirror redirects to the default avatar URL', async () => {
    const defaultUrl = defaultAvatarUrl()
    mockFetch([new Response(null, { status: 302, headers: { location: defaultUrl } })])
    expect(await withAllowedMirror(() => fetchAvatarImage('hash'))).toBeNull()
  })

  it('follows a non-default redirect', async () => {
    const body = Buffer.from([0x89, 0x50])
    mockFetch([
      new Response(null, { status: 302, headers: { location: 'https://gravatar.com/avatar/real?d=x' } }),
      new Response(body, { status: 200 }),
    ])
    expect(await withAllowedMirror(() => fetchAvatarImage('hash'))).not.toBeNull()
  })

  it('rejects a redirect to an internal address (SSRF)', async () => {
    const fetchFn = mockFetch([
      new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } }),
    ])
    expect(await withAllowedMirror(() => fetchAvatarImage('hash'))).toBeNull()
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('returns null on a 4xx response', async () => {
    mockFetch([new Response(null, { status: 404 })])
    expect(await withAllowedMirror(() => fetchAvatarImage('hash'))).toBeNull()
  })

  it('returns null when a 3xx response has no location header', async () => {
    mockFetch([new Response(null, { status: 302 })])
    expect(await withAllowedMirror(() => fetchAvatarImage('hash'))).toBeNull()
  })

  it('returns null when fetch throws a network error', async () => {
    mockFetch([
      () => {
        throw new TypeError('fetch failed', { cause: new AggregateError([], 'ETIMEDOUT') })
      },
    ])
    expect(await withAllowedMirror(() => fetchAvatarImage('hash'))).toBeNull()
  })
})

describe('render/avatar/fetch — fetchQQAvatarImage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null for non-QQ emails without calling fetch', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    expect(await fetchQQAvatarImage('a@b.com')).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })

  it('returns bytes on a 2xx response', async () => {
    const body = Buffer.from([0xff, 0xd8])
    mockFetch([new Response(body, { status: 200 })])
    expect(await fetchQQAvatarImage('12345@qq.com')).not.toBeNull()
  })

  it('returns null on a non-2xx response', async () => {
    mockFetch([new Response(null, { status: 500 })])
    expect(await fetchQQAvatarImage('12345@qq.com')).toBeNull()
  })

  it('returns null when fetch throws a network error', async () => {
    mockFetch([
      () => {
        throw new TypeError('fetch failed', { cause: new AggregateError([], 'ETIMEDOUT') })
      },
    ])
    expect(await fetchQQAvatarImage('12345@qq.com')).toBeNull()
  })
})
