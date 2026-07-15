import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/server/domains/content/schema', () => ({
  isLive: vi.fn(() => true),
}))

vi.mock('@/server/domains/pages/repo', () => ({
  findPublicPageMetaBySlug: vi.fn(),
}))

vi.mock('@/server/domains/posts/repos/single', () => ({
  findPublicPostMetaBySlug: vi.fn(),
}))

vi.mock('@/server/domains/taxonomies/categories/services/query', () => ({
  findCategoryBySlug: vi.fn(),
}))

vi.mock('@/server/http/resources/avatar-cache', () => ({
  AvatarStatus: { NO_AVATAR: 'no_avatar', HAVE_AVATAR: 'have_avatar' },
  cacheAvatar: vi.fn().mockResolvedValue(undefined),
  loadAvatar: vi.fn(),
}))

vi.mock('@/server/http/resources/calendar', () => ({
  serveCalendar: vi.fn(),
}))

vi.mock('@/server/infra/rate-limit', () => ({
  tryResourceRateLimit: vi.fn().mockResolvedValue({ exceeded: false, count: 1 }),
}))

vi.mock('@/server/infra/redis/buffer-cache', () => ({
  loadBuffer: vi.fn(),
}))

vi.mock('@/server/render/avatar/fetch', () => ({
  defaultAvatarUrl: vi.fn(() => '/images/default-avatar.png'),
  fetchAvatarImage: vi.fn(),
  fetchQQAvatarImage: vi.fn(),
  isQQEmail: vi.fn((email: string) => email.endsWith('@qq.com')),
  resolveAvatarInfo: vi.fn(),
}))

vi.mock('@/server/render/og/render', () => ({
  drawOpenGraph: vi.fn().mockResolvedValue(Buffer.from('png')),
}))

vi.mock('@/shared/config/getters', () => ({
  getCacheSettings: vi.fn(() => ({ cache: { og: { prefix: 'og:', ttlSeconds: 3600 } } })),
  requireBlogSettingsSection: vi.fn((section: string) =>
    section === 'siteIdentity' ? { website: 'https://example.com', description: 'desc' } : {},
  ),
}))

vi.mock('@/shared/utils/urls', () => ({
  joinUrl: vi.fn((base: string, path: string) => `${base}${path}`),
}))

import { findPublicPageMetaBySlug } from '@/server/domains/pages/repo'
import { findPublicPostMetaBySlug } from '@/server/domains/posts/repos/single'
import { findCategoryBySlug } from '@/server/domains/taxonomies/categories/services/query'
import { loadAvatar } from '@/server/http/resources/avatar-cache'
import { serveCalendar } from '@/server/http/resources/calendar'
import { imagesRouter } from '@/server/http/resources/images'
import { tryResourceRateLimit } from '@/server/infra/rate-limit'
import { loadBuffer } from '@/server/infra/redis/buffer-cache'
import { fetchAvatarImage, fetchQQAvatarImage, resolveAvatarInfo } from '@/server/render/avatar/fetch'
import { drawOpenGraph } from '@/server/render/og/render'

const env = { db: {}, clientAddress: '127.0.0.1' } as never

describe('images resource', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    ;(tryResourceRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue({ exceeded: false, count: 1 })
    ;(loadBuffer as ReturnType<typeof vi.fn>).mockResolvedValue(Buffer.from('png'))
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
    const res = await imagesRouter.request('http://localhost/images/og/post.png', undefined, env)
    expect(res.status).toBe(200)
  })

  it('renders an OG image for a page', async () => {
    ;(findPublicPageMetaBySlug as ReturnType<typeof vi.fn>).mockResolvedValue({
      title: 'Page',
      summary: 'Page summary',
      cover: 'cover.jpg',
    })
    const res = await imagesRouter.request('http://localhost/images/og/page.png', undefined, env)
    expect(res.status).toBe(200)
  })

  it('falls back when no entity is found', async () => {
    const res = await imagesRouter.request('http://localhost/images/og/missing.png', undefined, env)
    expect(res.status).toBe(302)
  })

  it('renders an OG image for a category', async () => {
    ;(findCategoryBySlug as ReturnType<typeof vi.fn>).mockResolvedValue({ name: 'Code', description: '', cover: '' })
    const res = await imagesRouter.request('http://localhost/images/og/cats/code.png', undefined, env)
    expect(res.status).toBe(200)
  })

  it('serves a calendar image', async () => {
    const res = await imagesRouter.request('http://localhost/images/calendar/2026/now.png', undefined, env)
    expect(res.status).toBe(200)
  })

  it('serves a dark calendar image', async () => {
    const res = await imagesRouter.request('http://localhost/images/calendar/dark/2026/now.png', undefined, env)
    expect(res.status).toBe(200)
  })

  it('serves a cached avatar', async () => {
    ;(resolveAvatarInfo as ReturnType<typeof vi.fn>).mockResolvedValue({ email: 'a@example.com', hash: 'abc' })
    ;(loadAvatar as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'have_avatar', buffer: Buffer.from('av') })
    ;(fetchAvatarImage as ReturnType<typeof vi.fn>).mockResolvedValue(Buffer.from('av'))
    const res = await imagesRouter.request('http://localhost/images/avatar/abc.png', undefined, env)
    expect(res.status).toBe(200)
  })

  it('falls back to default avatar when hash is empty', async () => {
    ;(resolveAvatarInfo as ReturnType<typeof vi.fn>).mockResolvedValue({ email: '', hash: null })
    const res = await imagesRouter.request('http://localhost/images/avatar/abc.png', undefined, env)
    expect(res.status).toBe(302)
  })
})
