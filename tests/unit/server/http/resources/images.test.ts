import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

vi.mock('@/server/domains/content/schemas/live-gate', () => ({
  isLive: vi.fn(() => true),
}))

vi.mock('@/server/domains/pages/services/public-query', () => ({
  findPublicPageMetaBySlug: vi.fn(),
}))

vi.mock('@/server/domains/posts/services/single', () => ({
  findPublicPostMetaBySlug: vi.fn(),
}))

vi.mock('@/server/http/resources/avatar-cache', () => ({
  AvatarStatus: { NO_AVATAR: 'no_avatar', HAVE_AVATAR: 'have_avatar' },
  cacheAvatar: vi.fn().mockResolvedValue(undefined),
  loadAvatar: vi.fn(),
}))

vi.mock('@/server/http/resources/calendar', () => ({
  serveCalendar: vi.fn(),
}))

vi.mock('@/server/domains/taxonomies/categories/services/query', () => ({
  findCategoryBySlug: vi.fn(),
}))

vi.mock('@/server/infra/rate-limit', () => ({
  readBucket: vi.fn(() => ({ windowSeconds: 60, maxAttempts: 60 })),
  tryKeyedRateLimit: vi.fn().mockResolvedValue({ exceeded: false, count: 1 }),
}))

vi.mock('@/server/infra/cache/registry', () => ({
  through: vi.fn(),
}))

vi.mock('@/server/domains/comments/services/avatar', () => ({
  defaultAvatarUrl: vi.fn(() => '/images/default-avatar.png'),
  fetchAvatarImage: vi.fn(),
  fetchQQAvatarImage: vi.fn(),
  isQQEmail: vi.fn((email: string) => email.endsWith('@qq.com')),
  resolveAvatarInfo: vi.fn(),
  // Pass-through stub so the tests can watch `?s=` flow into the cache and
  // fetch calls; the clamping rules live in the service's own unit tests.
  resolveAvatarSize: vi.fn((raw: string | undefined) => (raw === undefined || raw === '' ? 120 : Number(raw))),
}))

vi.mock('@/server/render/og/render', () => ({
  drawOpenGraph: vi.fn().mockResolvedValue(Buffer.from('png')),
}))

vi.mock('@/shared/config/getters', () => ({
  requireBlogSettingsSection: vi.fn((section: string) =>
    section === 'siteIdentity' ? { website: 'https://example.com', description: 'desc' } : {},
  ),
}))

vi.mock('@/shared/utils/urls', () => ({
  joinUrl: vi.fn((base: string, path: string) => `${base}${path}`),
}))

import { fetchAvatarImage, fetchQQAvatarImage, resolveAvatarInfo } from '@/server/domains/comments/services/avatar'
import { findPublicPageMetaBySlug } from '@/server/domains/pages/services/public-query'
import { findPublicPostMetaBySlug } from '@/server/domains/posts/services/single'
import { findCategoryBySlug } from '@/server/domains/taxonomies/categories/services/query'
import { loadAvatar } from '@/server/http/resources/avatar-cache'
import { serveCalendar } from '@/server/http/resources/calendar'
import { imagesRouter } from '@/server/http/resources/images'
import { through } from '@/server/infra/cache/registry'
import { readBucket, tryKeyedRateLimit } from '@/server/infra/rate-limit'
import { drawOpenGraph } from '@/server/render/og/render'

function requestImages(url: string) {
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('requestContext', { db: {}, clientAddress: '127.0.0.1' } as never)
    await next()
  })
  app.route('/', imagesRouter)
  return app.request(url)
}

describe('images resource', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    ;(readBucket as ReturnType<typeof vi.fn>).mockReturnValue({ windowSeconds: 60, maxAttempts: 60 })
    ;(tryKeyedRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue({ exceeded: false, count: 1 })
    // Default: a cache miss — run the loader and return its value.
    ;(through as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_db: unknown, _id: unknown, _params: unknown, loader: () => unknown) => loader(),
    )
    ;(serveCalendar as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response('cal', { headers: { 'Content-Type': 'image/png' } }),
    )
    ;(findPublicPostMetaBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    ;(findPublicPageMetaBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    ;(findCategoryBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
  })

  it('renders an OG image for a post', async () => {
    ;(findPublicPostMetaBySlug as ReturnType<typeof vi.fn>).mockResolvedValue({
      title: 'Post',
      summary: 'Summary',
      cover: 'cover.jpg',
      published: true,
      publishedRevisionId: 1n,
    })
    const res = await requestImages('http://localhost/images/og/post.png')
    expect(res.status).toBe(200)
  })

  it('renders an OG image for a page', async () => {
    ;(findPublicPageMetaBySlug as ReturnType<typeof vi.fn>).mockResolvedValue({
      title: 'Page',
      summary: 'Page summary',
      cover: 'cover.jpg',
    })
    const res = await requestImages('http://localhost/images/og/page.png')
    expect(res.status).toBe(200)
  })

  it('falls back when no entity is found', async () => {
    const res = await requestImages('http://localhost/images/og/missing.png')
    expect(res.status).toBe(302)
  })

  it('renders an OG image for a category', async () => {
    ;(findCategoryBySlug as ReturnType<typeof vi.fn>).mockResolvedValue({ name: 'Code', description: '', cover: '' })
    const res = await requestImages('http://localhost/images/og/cats/code.png')
    expect(res.status).toBe(200)
  })

  it('serves a calendar image', async () => {
    const res = await requestImages('http://localhost/images/calendar/2026/now.png')
    expect(res.status).toBe(200)
  })

  it('serves a dark calendar image', async () => {
    const res = await requestImages('http://localhost/images/calendar/dark/2026/now.png')
    expect(res.status).toBe(200)
  })

  it('serves a cached avatar', async () => {
    ;(resolveAvatarInfo as ReturnType<typeof vi.fn>).mockResolvedValue({ email: 'a@example.com', hash: 'abc' })
    ;(loadAvatar as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'have_avatar', buffer: Buffer.from('av') })
    ;(fetchAvatarImage as ReturnType<typeof vi.fn>).mockResolvedValue(Buffer.from('av'))
    const res = await requestImages('http://localhost/images/avatar/abc.png')
    expect(res.status).toBe(200)
  })

  it('threads the `?s=` size into the cache lookup, defaulting to 120', async () => {
    ;(resolveAvatarInfo as ReturnType<typeof vi.fn>).mockResolvedValue({ email: null, hash: 'abc' })
    ;(loadAvatar as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'have_avatar', buffer: Buffer.from('av') })
    const res = await requestImages('http://localhost/images/avatar/abc.png?s=256')
    expect(res.status).toBe(200)
    expect(loadAvatar).toHaveBeenCalledWith({}, 'abc', 256)
    ;(loadAvatar as ReturnType<typeof vi.fn>).mockClear()
    await requestImages('http://localhost/images/avatar/abc.png')
    expect(loadAvatar).toHaveBeenCalledWith({}, 'abc', 120)
  })

  it('falls back to default avatar when hash is empty', async () => {
    ;(resolveAvatarInfo as ReturnType<typeof vi.fn>).mockResolvedValue({ email: '', hash: null })
    const res = await requestImages('http://localhost/images/avatar/abc.png')
    expect(res.status).toBe(302)
  })
})
