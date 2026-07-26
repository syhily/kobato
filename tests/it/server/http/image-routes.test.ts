import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

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
vi.mock('@/server/http/resources/avatar-cache', () => ({
  AvatarStatus: { HAVE_AVATAR: 0, NO_AVATAR: 1 },
  cacheAvatar: vi.fn(),
  loadAvatar: vi.fn().mockResolvedValue(null),
}))
// catalog/catalog was removed; images.ts now resolves slugs via
// findPublicPostMetaBySlug / findPublicPageMetaBySlug (mocked below).
vi.mock('@/server/domains/comments/services/avatar', () => ({
  defaultAvatarUrl: () => 'https://example.test/images/default-avatar.png',
  fetchAvatarImage: vi.fn().mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  fetchQQAvatarImage: vi.fn(),
  isQQEmail: () => false,
  resolveAvatarInfo: vi.fn().mockImplementation(async (hash: string) => ({ email: null, hash })),
  resolveAvatarSize: vi.fn((raw: string | undefined) => (raw === undefined || raw === '' ? 120 : Number(raw))),
}))
vi.mock('@/server/render/og/render', () => ({
  drawOpenGraph: vi.fn().mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
}))
vi.mock('@/server/http/resources/calendar', () => ({
  serveCalendar: vi.fn().mockImplementation(
    async (_db: unknown, params: { year?: string; time?: string }) =>
      new Response(JSON.stringify(params), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  ),
}))
vi.mock('@/server/domains/pages/services/public-query', () => ({
  listPublicPageMetas: vi.fn(async () => []),
  findPublicPageMetaBySlug: vi.fn(),
}))
vi.mock('@/server/domains/posts/services/single', () => ({
  findPublicPostMetaBySlug: vi.fn(),
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

// The perimeter normally derives the canonical RequestContext in
// `requestContextMiddleware`; these route-level tests wrap the router in an
// app that stubs the only two fields the images pipeline reads
// (rate-limit → `clientAddress`, handlers → `db`).
const app = new Hono<Env>()
app.use('*', async (c, next) => {
  c.set('requestContext', {
    clientAddress: '127.0.0.1',
    db: undefined,
  } as unknown as Env['Variables']['requestContext'])
  await next()
})
app.route('/', imagesRouter)

describe('imagesRouter avatar', () => {
  it('extracts the bare hash from `/images/avatar/<hash>.png`', async () => {
    const { resolveAvatarInfo } = await import('@/server/domains/comments/services/avatar')
    const res = await app.request('/images/avatar/abcdef0123456789.png')
    // Route does NOT 404 (it now resolves the hash; the path-parser bug
    // would have driven this into the missing-param fallback).
    expect(res.status).toBeLessThan(500)
    expect(vi.mocked(resolveAvatarInfo)).toHaveBeenCalledWith(undefined, 'abcdef0123456789')
  })

  it('matches numeric ids the same way', async () => {
    const { resolveAvatarInfo } = await import('@/server/domains/comments/services/avatar')
    await app.request('/images/avatar/42.png')
    expect(vi.mocked(resolveAvatarInfo)).toHaveBeenNthCalledWith(2, undefined, '42')
  })

  it('rejects non-png extensions with 404', async () => {
    const res = await app.request('/images/avatar/42.jpg')
    expect(res.status).toBe(404)
  })
})

describe('imagesRouter og', () => {
  it('looks up slug via findPublicPostMetaBySlug and findPublicPageMetaBySlug in parallel', async () => {
    const { findPublicPostMetaBySlug } = await import('@/server/domains/posts/services/single')
    const { findPublicPageMetaBySlug } = await import('@/server/domains/pages/services/public-query')
    await app.request('/images/og/hello-world.png')
    expect(vi.mocked(findPublicPostMetaBySlug)).toHaveBeenCalledWith(undefined, 'hello-world')
    expect(vi.mocked(findPublicPageMetaBySlug)).toHaveBeenCalledWith(undefined, 'hello-world')
  })
})

describe('imagesRouter calendar', () => {
  it('extracts year + time from `/images/calendar/<year>/<time>.png`', async () => {
    const { serveCalendar } = await import('@/server/http/resources/calendar')
    await app.request('/images/calendar/2024/12-25.png')
    expect(vi.mocked(serveCalendar)).toHaveBeenCalledWith(
      undefined,
      { year: '2024', time: '12-25' },
      'light',
      expect.anything(),
    )
  })

  it('routes the dark variant to the dark theme', async () => {
    const { serveCalendar } = await import('@/server/http/resources/calendar')
    await app.request('/images/calendar/dark/2024/01-01.png')
    expect(vi.mocked(serveCalendar)).toHaveBeenCalledWith(
      undefined,
      { year: '2024', time: '01-01' },
      'dark',
      expect.anything(),
    )
  })
})
