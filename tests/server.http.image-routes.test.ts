import { describe, expect, it, vi } from 'vitest'

// Regression net for the Hono path-parser footgun that was silently
// degrading every `/images/*.png` endpoint to its fallback branch.
//
// Pattern `/foo/:name.png` does NOT match `:name` against a single
// segment and `.png` as a literal suffix. Hono treats the `.png` as
// part of the param NAME, so `c.req.param('name')` returns `undefined`
// and `c.req.param()` reveals an entry keyed `name.png`. Every handler
// then short-circuits to its "missing param" fallback. The user-facing
// symptom is "every avatar shows the default" — and (silently) every
// OG image and calendar image too.
//
// The fix in `src/server/http/resources/images.ts` declares each route
// with an explicit `{[^/]+\\.png}` constraint and strips the extension
// in the handler. These tests pin both halves.

// Stub the heavy backends so we can assert routing without running the
// real rendering pipeline.
vi.mock('@/server/render/avatar/cache', () => ({
  AvatarStatus: { HAVE_AVATAR: 0, NO_AVATAR: 1 },
  cacheAvatar: vi.fn(),
  loadAvatar: vi.fn().mockResolvedValue(null),
}))
// catalog/catalog was removed; images.ts now queries posts/repo and pages/repo
// directly via findPostBySlug / findPageBySlug in parallel.
vi.mock('@/server/render/avatar/fetch', () => ({
  defaultAvatarUrl: () => 'https://example.test/images/default-avatar.png',
  fetchAvatarImage: vi.fn().mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  fetchQQAvatarImage: vi.fn(),
  isQQEmail: () => false,
  resolveAvatarInfo: vi.fn().mockImplementation(async (hash: string) => ({ email: null, hash })),
}))
vi.mock('@/server/render/og/render', () => ({
  drawOpenGraph: vi.fn().mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
}))
vi.mock('@/server/render/calendar/serve', () => ({
  serveCalendar: vi.fn().mockImplementation(
    async (params: { year?: string; time?: string }) =>
      new Response(JSON.stringify(params), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  ),
}))
vi.mock('@/server/domains/pages/repo', () => ({
  listPublicPageMetas: vi.fn(async () => []),
  findPageBySlug: vi.fn(),
}))
vi.mock('@/server/domains/posts/repos/single', () => ({
  findPostBySlug: vi.fn().mockResolvedValue({ title: 'T', summary: 'S', cover: 'C' }),
}))
vi.mock('@/shared/config/getters', () => ({
  requireBlogSettingsSection: (section: string) => {
    if (section === 'siteIdentity') {
      return { website: 'https://example.test', description: 'desc' }
    }
    if (section === 'cache') {
      return { cache: { og: { prefix: 'og:', ttlSeconds: 3600 } } }
    }
    if (section === 'rateLimit') {
      return { rateLimit: { resourceIp: { windowSeconds: 60, maxAttempts: 60 } } }
    }
    return {}
  },
  getCacheSettings: () => ({ cache: { og: { prefix: 'og:', ttlSeconds: 3600 } } }),
  getBlogSettingsBundleSync: () => ({
    rateLimit: { resourceIp: { windowSeconds: 60, maxAttempts: 60 } },
  }),
}))

const { imagesRouter } = await import('@/server/http/resources/images')

describe('imagesRouter avatar', () => {
  it('extracts the bare hash from `/images/avatar/<hash>.png`', async () => {
    const { resolveAvatarInfo } = await import('@/server/render/avatar/fetch')
    const res = await imagesRouter.request('/images/avatar/abcdef0123456789.png')
    // Route does NOT 404 (it now resolves the hash; the path-parser bug
    // would have driven this into the missing-param fallback).
    expect(res.status).toBeLessThan(500)
    expect(vi.mocked(resolveAvatarInfo)).toHaveBeenCalledWith(undefined, 'abcdef0123456789')
  })

  it('matches numeric ids the same way', async () => {
    const { resolveAvatarInfo } = await import('@/server/render/avatar/fetch')
    await imagesRouter.request('/images/avatar/42.png')
    expect(vi.mocked(resolveAvatarInfo)).toHaveBeenNthCalledWith(2, undefined, '42')
  })

  it('rejects non-png extensions with 404', async () => {
    const res = await imagesRouter.request('/images/avatar/42.jpg')
    expect(res.status).toBe(404)
  })
})

describe('imagesRouter og', () => {
  it('looks up slug via findPostBySlug and findPageBySlug in parallel', async () => {
    const { findPostBySlug } = await import('@/server/domains/posts/repos/single')
    const { findPageBySlug } = await import('@/server/domains/pages/repo')
    await imagesRouter.request('/images/og/hello-world.png')
    expect(vi.mocked(findPostBySlug)).toHaveBeenCalledWith(undefined, 'hello-world')
    expect(vi.mocked(findPageBySlug)).toHaveBeenCalledWith(undefined, 'hello-world')
  })
})

describe('imagesRouter calendar', () => {
  it('extracts year + time from `/images/calendar/<year>/<time>.png`', async () => {
    const { serveCalendar } = await import('@/server/render/calendar/serve')
    await imagesRouter.request('/images/calendar/2024/12-25.png')
    expect(vi.mocked(serveCalendar)).toHaveBeenCalledWith({ year: '2024', time: '12-25' }, 'light', expect.anything())
  })

  it('routes the dark variant to the dark theme', async () => {
    const { serveCalendar } = await import('@/server/render/calendar/serve')
    await imagesRouter.request('/images/calendar/dark/2024/01-01.png')
    expect(vi.mocked(serveCalendar)).toHaveBeenCalledWith({ year: '2024', time: '01-01' }, 'dark', expect.anything())
  })
})
