import { beforeEach, describe, expect, it, vi } from 'vitest'

import { makeCategory, makePost, makePostList, makeTag } from '#/_helpers/catalog'
// Listing routes (`/cats/:slug`, `/tags/:slug`, `/search/:keyword`) all share
// the same skeleton. We pin the public 404/redirect contracts that are part
// of the URL surface (AGENTS.md says these paths must remain stable forever).

const publicPosts = makePostList(3, { slug: 'post' })
const hiddenPost = makePost({ slug: 'hidden-post', visible: false })
const samplePosts = [...publicPosts, hiddenPost]
const sampleCategory = makeCategory({ name: 'general', slug: 'general' })
const sampleTag = makeTag({ name: 'typescript', slug: 'typescript' })

vi.mock('@/server/domains/auth/context', async () => {
  const actual = await vi.importActual<typeof import('@/server/domains/auth/context')>('@/server/domains/auth/context')
  return {
    ...actual,
    getDbFromContext: vi.fn(() => ({}) as import('drizzle-orm/node-postgres').NodePgDatabase),
    getPoolFromContext: vi.fn(() => ({}) as import('pg').Pool),
  }
})

vi.mock('@/server/infra/db/operations/category', () => ({
  findCategoryBySlug: vi.fn(async (_db: unknown, slug: string) => (slug === 'general' ? sampleCategory : null)),
}))
vi.mock('@/server/infra/db/operations/tag', () => ({
  findTagBySlug: vi.fn(async (_db: unknown, slug: string) => (slug === 'typescript' ? sampleTag : null)),
}))

vi.mock('@/shared/types/catalog', async () => {
  const actual = await vi.importActual<typeof import('@/shared/types/catalog')>('@/shared/types/catalog')
  return {
    ...actual,
    toClientPost: (p: unknown) => p,
    toListingPostCard: (p: unknown) => p,
  }
})

vi.mock('@/server/domains/posts/repos/public-query', () => ({
  listPostsByCategory: vi.fn(async (_db: unknown, _name: string, options: { includeHidden?: boolean }) =>
    options?.includeHidden ? samplePosts : publicPosts,
  ),
  listPostsByTag: vi.fn(async (_db: unknown, _name: string, options: { includeHidden?: boolean }) =>
    options?.includeHidden ? samplePosts : publicPosts,
  ),
  getPostsBySlugs: vi.fn(async (_db: unknown, _slugs: string[], options: { includeHidden?: boolean }) =>
    options?.includeHidden ? samplePosts : publicPosts,
  ),
  countPublicPosts: vi.fn(
    async (_db: unknown, _filters: { includeHidden?: boolean; category?: string; tag?: string }) =>
      _filters?.includeHidden ? samplePosts.length : publicPosts.length,
  ),
  listPublicPostCardsPaginated: vi.fn(
    async (
      _db: unknown,
      _pageNum: number,
      _pageSize: number,
      options: { includeHidden?: boolean; category?: string; tag?: string },
    ) => {
      const posts = options?.includeHidden ? samplePosts : publicPosts
      return { posts, total: posts.length }
    },
  ),
  getClientPostsWithMetadata: vi.fn(async (_db: unknown, posts: unknown[]) =>
    (posts as Array<{ slug: string }>).map((p) => ({
      ...p,
      meta: { likes: 0, views: 0, comments: 0 },
    })),
  ),
}))

vi.mock('@/server/http/loaders/sidebar', () => ({
  loadSidebarData: vi.fn(async () => ({ recentComments: [], pendingComments: [] })),
}))

vi.mock('@/server/infra/search/options', () => ({
  searchPostOptions: vi.fn(() => ({ includeHidden: true, includeScheduled: false })),
}))

vi.mock('@/server/infra/search/search', () => ({
  searchPosts: vi.fn(async () => ({
    hits: samplePosts.map((p) => p.slug),
    page: 1,
    totalPages: 2,
  })),
}))

const categoryRoute = await import('@/routes/public/category/list')
const tagRoute = await import('@/routes/public/tag/list')
const searchRoute = await import('@/routes/public/search/list')
beforeEach(() => {
  vi.clearAllMocks()
})

describe('routes/category.list loader', () => {
  it("404s when the slug doesn't match a known category", async () => {
    await expect(
      categoryRoute.loader({
        request: new Request('http://localhost/cats/missing'),
        params: { slug: 'missing' },
      } as unknown as Parameters<typeof categoryRoute.loader>[0]),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('returns the canonical payload (admin/path/seo) for a real category', async () => {
    const data = await categoryRoute.loader({
      request: new Request('http://localhost/cats/general'),
      params: { slug: 'general' },
    } as unknown as Parameters<typeof categoryRoute.loader>[0])

    expect(data.title).toBe('general')
    const canonical = data.seo.find(
      (tag) =>
        tag !== null &&
        typeof tag === 'object' &&
        'tagName' in tag &&
        tag.tagName === 'link' &&
        tag.rel === 'canonical',
    ) as { href: string } | undefined
    expect(canonical?.href).toContain('/cats/general')
  })

  it('includes hidden posts for public category visitors', async () => {
    const data = (await categoryRoute.loader({
      request: new Request('http://localhost/cats/general'),
      params: { slug: 'general' },
    } as unknown as Parameters<typeof categoryRoute.loader>[0])) as { resolvedPosts: Array<{ slug: string }> }

    expect(data.resolvedPosts.map((post) => post.slug)).toContain('hidden-post')
  })

  it('includes hidden posts for admin category visitors', async () => {
    const data = (await categoryRoute.loader({
      request: new Request('http://localhost/cats/general'),
      params: { slug: 'general' },
    } as unknown as Parameters<typeof categoryRoute.loader>[0])) as { resolvedPosts: Array<{ slug: string }> }

    expect(data.resolvedPosts.map((post) => post.slug)).toContain('hidden-post')
  })
})

describe('routes/tag.list loader', () => {
  it("404s when the slug doesn't match a known tag", async () => {
    await expect(
      tagRoute.loader({
        request: new Request('http://localhost/tags/missing'),
        params: { slug: 'missing' },
      } as unknown as Parameters<typeof tagRoute.loader>[0]),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('returns the canonical payload for a real tag', async () => {
    const data = (await tagRoute.loader({
      request: new Request('http://localhost/tags/typescript'),
      params: { slug: 'typescript' },
    } as unknown as Parameters<typeof tagRoute.loader>[0])) as { title: string }

    expect(data.title).toContain('typescript')
  })

  it('includes hidden tag posts for public visitors', async () => {
    const data = (await tagRoute.loader({
      request: new Request('http://localhost/tags/typescript'),
      params: { slug: 'typescript' },
    } as unknown as Parameters<typeof tagRoute.loader>[0])) as { resolvedPosts: Array<{ slug: string }> }

    expect(data.resolvedPosts.map((post) => post.slug)).toContain('hidden-post')
  })
})

describe('routes/search.list loader', () => {
  it('redirects to / when the keyword is empty / whitespace', async () => {
    await expect(
      searchRoute.loader({
        request: new Request('http://localhost/search/'),
        params: { keyword: '   ' },
      } as unknown as Parameters<typeof searchRoute.loader>[0]),
    ).rejects.toMatchObject({ status: 302 })
  })

  it('returns the search payload with forced noindex SEO for a real query', async () => {
    const data = await searchRoute.loader({
      request: new Request('http://localhost/search/react'),
      params: { keyword: 'react' },
    } as unknown as Parameters<typeof searchRoute.loader>[0])

    expect(data.title).toContain('react')
    const robots = data.seo.find(
      (tag) => tag !== null && typeof tag === 'object' && 'name' in tag && tag.name === 'robots',
    ) as { content: string } | undefined
    expect(robots?.content).toContain('noindex')
  })

  it('includes hidden posts in public search results', async () => {
    const data = (await searchRoute.loader({
      request: new Request('http://localhost/search/react'),
      params: { keyword: 'react' },
    } as unknown as Parameters<typeof searchRoute.loader>[0])) as { resolvedPosts: Array<{ slug: string }> }

    expect(data.resolvedPosts.map((post) => post.slug)).toContain('hidden-post')
  })
})
