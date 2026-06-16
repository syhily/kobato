import { beforeEach, describe, expect, it, vi } from 'vitest'

// Tests for the OG image route slug resolution in `imagesRouter`.
// The route uses slim public-meta lookups (findPublicPostMetaBySlug +
// findPublicPageMetaBySlug) instead of the heavier findPostBySlug /
// findPageBySlug.

const mocks = vi.hoisted(() => ({
  findPublicPostMetaBySlug: vi.fn(async (): Promise<unknown> => null),
  findPublicPageMetaBySlug: vi.fn(async (): Promise<unknown> => null),
  findPostBySlug: vi.fn(async (): Promise<unknown> => null),
  findPageBySlug: vi.fn(async (): Promise<unknown> => null),
  drawOpenGraph: vi.fn(() => Buffer.from('og-image')),
}))

vi.mock('@/server/domains/posts/repos/single', () => ({
  findPublicPostMetaBySlug: mocks.findPublicPostMetaBySlug,
  findPostBySlug: mocks.findPostBySlug,
}))
vi.mock('@/server/domains/pages/repo', () => ({
  findPublicPageMetaBySlug: mocks.findPublicPageMetaBySlug,
  findPageBySlug: mocks.findPageBySlug,
}))
vi.mock('@/server/render/og/render', () => ({
  drawOpenGraph: mocks.drawOpenGraph,
}))
vi.mock('@/server/infra/rate-limit', () => ({
  tryResourceRateLimit: vi.fn(async () => ({ exceeded: false })),
}))
vi.mock('@/server/infra/redis/buffer-cache', () => ({
  loadBuffer: vi.fn(async (_key: unknown, loader: () => Promise<unknown>) => loader()),
}))
vi.mock('@/shared/config/getters', () => ({
  requireBlogSettingsSection: vi.fn((section: string) => {
    if (section === 'cache') {
      return { cache: { og: { prefix: 'og:', ttlSeconds: 3600 } } }
    }
    if (section === 'siteIdentity') {
      return { description: 'A blog', website: 'https://example.com' }
    }
    if (section === 'rateLimit') {
      return { rateLimit: { resourceIp: { windowSeconds: 60, maxAttempts: 60 } } }
    }
    return {}
  }),
  getCacheSettings: () => ({ cache: { og: { prefix: 'og:', ttlSeconds: 3600 } } }),
  getBlogSettingsBundleSync: () => ({
    rateLimit: { resourceIp: { windowSeconds: 60, maxAttempts: 60 } },
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findPublicPostMetaBySlug.mockImplementation(async () => null)
  mocks.findPublicPageMetaBySlug.mockImplementation(async () => null)
})

import type { imagesRouter as ImagesRouter } from '@/server/http/resources/images'

let imagesRouter: typeof ImagesRouter

beforeEach(async () => {
  if (!imagesRouter) {
    const mod = await import('@/server/http/resources/images')
    imagesRouter = mod.imagesRouter
  }
})

async function requestOg(slug: string) {
  const res = await imagesRouter.request(`/images/og/${slug}.png`)
  return res
}

const publicPostMeta = {
  title: 'Hello',
  summary: 'World',
  cover: '/cover.png',
  published: true,
  publishedRevisionId: 1n,
  publishedAt: new Date('2020-01-01'),
  deletedAt: null,
}

const publicPageMeta = {
  title: 'About',
  summary: 'About page',
  cover: '/about.png',
  published: true,
  publishedRevisionId: 1n,
  publishedAt: new Date('2020-01-01'),
  deletedAt: null,
}

describe('OG image slug resolution', () => {
  it('returns PNG when slug matches a public post', async () => {
    mocks.findPublicPostMetaBySlug.mockImplementation(async () => publicPostMeta)

    const res = await requestOg('hello')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
  })

  it('returns PNG when slug matches a public page', async () => {
    mocks.findPublicPageMetaBySlug.mockImplementation(async () => publicPageMeta)

    const res = await requestOg('about')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
  })

  it('falls back when slug matches neither post nor page', async () => {
    const res = await requestOg('nonexistent')
    expect(res.status).toBe(302)
  })

  it('falls back when post is not public', async () => {
    mocks.findPublicPostMetaBySlug.mockImplementation(async () => ({
      ...publicPostMeta,
      published: false,
    }))

    const res = await requestOg('draft-post')
    expect(res.status).toBe(302)
  })

  it('falls back when page is not catalog visible', async () => {
    mocks.findPublicPageMetaBySlug.mockImplementation(async () => ({
      ...publicPageMeta,
      publishedAt: new Date('2099-01-01'),
    }))

    const res = await requestOg('scheduled-page')
    expect(res.status).toBe(302)
  })

  it('uses post data when both post and page match (post wins)', async () => {
    mocks.findPublicPostMetaBySlug.mockImplementation(async () => publicPostMeta)
    mocks.findPublicPageMetaBySlug.mockImplementation(async () => publicPageMeta)

    const res = await requestOg('collision')
    expect(res.status).toBe(200)
    // Verify drawOpenGraph was called with post data, not page data.
    expect(mocks.drawOpenGraph).toHaveBeenCalledTimes(1)
    expect(mocks.drawOpenGraph).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Hello',
        summary: 'World',
        cover: '/cover.png',
      }),
    )
  })

  it('does not call full findPostBySlug / findPageBySlug loaders', async () => {
    mocks.findPublicPostMetaBySlug.mockImplementation(async () => publicPostMeta)

    await requestOg('hello')
    expect(mocks.findPostBySlug).not.toHaveBeenCalled()
    expect(mocks.findPageBySlug).not.toHaveBeenCalled()
  })

  it('404 for empty slug (route pattern mismatch)', async () => {
    // The route regex `[^/]+\.png` requires at least one character before `.png`,
    // so `/images/og/.png` does not match and returns 404 without hitting the handler.
    const res = await requestOg('')
    expect(res.status).toBe(404)
    expect(mocks.findPublicPostMetaBySlug).not.toHaveBeenCalled()
    expect(mocks.findPublicPageMetaBySlug).not.toHaveBeenCalled()
  })
})
