import { beforeEach, describe, expect, it, vi } from 'vitest'

// Tests for the OG image route slug resolution in `imagesRouter`.
// After removing getEntryBySlug, the route now uses parallel lookups
// (findPostBySlug + findPageBySlug).

const mocks = vi.hoisted(() => ({
  findPostBySlug: vi.fn(async (): Promise<unknown> => null),
  findPageBySlug: vi.fn(async (): Promise<unknown> => null),
  drawOpenGraph: vi.fn(() => Buffer.from('og-image')),
}))

vi.mock('@/server/domains/posts/repos/single', () => ({
  findPostBySlug: mocks.findPostBySlug,
}))
vi.mock('@/server/domains/pages/repo', () => ({
  findPageBySlug: mocks.findPageBySlug,
}))
vi.mock('@/server/render/og/render', () => ({
  drawOpenGraph: mocks.drawOpenGraph,
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
  mocks.findPostBySlug.mockImplementation(async () => null)
  mocks.findPageBySlug.mockImplementation(async () => null)
})

let imagesRouter: typeof import('@/server/http/resources/images').imagesRouter

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

describe('OG image slug resolution', () => {
  it('returns PNG when slug matches a post', async () => {
    mocks.findPostBySlug.mockImplementation(async () => ({
      title: 'Hello',
      summary: 'World',
      cover: '/cover.png',
    }))

    const res = await requestOg('hello')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
  })

  it('returns PNG when slug matches a page', async () => {
    mocks.findPageBySlug.mockImplementation(async () => ({
      title: 'About',
      summary: 'About page',
      cover: '/about.png',
    }))

    const res = await requestOg('about')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
  })

  it('falls back when slug matches neither post nor page', async () => {
    const res = await requestOg('nonexistent')
    expect(res.status).toBe(302)
  })

  it('uses post data when both post and page match (post wins)', async () => {
    mocks.findPostBySlug.mockImplementation(async () => ({
      title: 'Post Title',
      summary: 'Post Summary',
      cover: '/post-cover.png',
    }))
    mocks.findPageBySlug.mockImplementation(async () => ({
      title: 'Page Title',
      summary: 'Page Summary',
      cover: '/page-cover.png',
    }))

    const res = await requestOg('collision')
    expect(res.status).toBe(200)
    // Verify drawOpenGraph was called with post data, not page data.
    expect(mocks.drawOpenGraph).toHaveBeenCalledTimes(1)
    expect(mocks.drawOpenGraph).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Post Title',
        summary: 'Post Summary',
        cover: '/post-cover.png',
      }),
    )
  })

  it('404 for empty slug (route pattern mismatch)', async () => {
    // The route regex `[^/]+\.png` requires at least one character before `.png`,
    // so `/images/og/.png` does not match and returns 404 without hitting the handler.
    const res = await requestOg('')
    expect(res.status).toBe(404)
    expect(mocks.findPostBySlug).not.toHaveBeenCalled()
    expect(mocks.findPageBySlug).not.toHaveBeenCalled()
  })
})
