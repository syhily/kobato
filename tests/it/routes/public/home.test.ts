import { beforeEach, describe, expect, it, vi } from 'vitest'

import { makeCategory, makePostList, makeTag } from '#/_helpers/catalog'
import { makeLoaderArgsWithContext } from '#/_helpers/request-context'
import { regularSession } from '#/_helpers/session'

// `home` loader is the SSR fan-out for `/` and `/page/:num`. The route is
// part of the public URL surface (`AGENTS.md`: "/" canonical, "/page/N"
// 30x to /N=1 etc.) so we pin its three observable contracts:
//
//   1. /page/1 redirects to / (canonical collapse).
//   2. The 3-block payload (listing, sidebar, seo) is shaped correctly
//      for both the canonical / and the deep-paginated /page/N case.
//   3. Out-of-range pagination triggers a redirect to the last real page.

const session = regularSession()

// Fixture size and pagination: the home loader's tail-merge guard
// folds an orphan last page into its predecessor when the tail is
// strictly smaller than `pageSize - 2`. The test blog-config fixture
// pins `pagination.posts = 6`, so threshold = 4 and a 7-post catalogue
// (tail = 1) would now merge into a single page, which would break
// the deep-paginated payload assertion below. We size the fixture at
// 10 posts so the natural page-2 tail is exactly 4, which fails the
// strict-less-than check and preserves the two-page split.
const allPosts = makePostList(10, { slug: 'post' })
const sampleCategory = makeCategory({ name: 'general', slug: 'general' })
const sampleTag = makeTag({ name: 'typescript', slug: 'typescript' })

const mocks = vi.hoisted(() => ({
  listClientPosts: vi.fn(),
  listAllTags: vi.fn(),
  postCount: 10,
  paginatedPosts: vi.fn(async (_db: unknown, pageNum: number, pageSize: number) => {
    const posts = mocks.listClientPosts() ?? []
    const start = (pageNum - 1) * pageSize
    return posts.slice(start, start + pageSize)
  }),
}))

vi.mock('@/server/domains/taxonomies/tags/service', () => ({
  listAllTags: mocks.listAllTags,
}))
vi.mock('@/server/domains/taxonomies/categories/services/query', () => ({
  getCategoryLink: vi.fn((name: string) => (name === sampleCategory.name ? sampleCategory.permalink : '')),
  getCategoryLinks: vi.fn(async (_db: unknown, names: string[]) =>
    Object.fromEntries(names.filter((n) => n === sampleCategory.name).map((n) => [n, sampleCategory.permalink])),
  ),
}))

vi.mock('@/shared/types/catalog', async () => {
  const actual = await vi.importActual<typeof import('@/shared/types/catalog')>('@/shared/types/catalog')
  return {
    ...actual,
    toClientPost: (p: unknown) => p,
    toListingPostCard: (p: unknown) => p,
    toSidebarPostLink: (p: unknown) => p,
  }
})

vi.mock('@/server/domains/posts/repos/public-query/listing', () => ({
  listClientPosts: mocks.listClientPosts,
  countPublicPosts: vi.fn(async () => mocks.postCount),
  listPublicPostCardsPaginated: mocks.paginatedPosts,
  getClientPostsWithMetadata: vi.fn(async (_db: unknown, posts: unknown[]) =>
    (posts as Array<{ slug: string; permalink: string }>).map((p) => ({
      ...p,
      meta: { likes: 0, views: 0, comments: 0 },
    })),
  ),
}))
vi.mock('@/server/domains/posts/repos/public-query/featured', () => ({
  selectFeaturePosts: vi.fn(async () => []),
  selectSidebarPosts: vi.fn(async () => []),
}))

vi.mock('@/server/http/loaders/sidebar', () => ({
  loadSidebarData: vi.fn(async () => ({
    admin: false,
    recentComments: [],
    pendingComments: [],
  })),
}))

const { loader } = await import('@/routes/public/home')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listClientPosts.mockReturnValue(allPosts)
  mocks.listAllTags.mockReturnValue([sampleTag])
})

describe('routes/home loader', () => {
  it('/page/1 collapses to / (canonical) via 30x redirect', async () => {
    await expect(
      loader(
        makeLoaderArgsWithContext({
          request: new Request('http://localhost/page/1'),
          session,
          params: { num: '1' },
        }),
      ),
    ).rejects.toMatchObject({ status: 302 })
  })

  it('returns the unified listing payload (resolvedPosts, extra.sidebar, empty seo) on /', async () => {
    const result = await loader(
      makeLoaderArgsWithContext({
        request: new Request('http://localhost/'),
        session,
        params: {},
      }),
    )

    expect(result.pageNum).toBe(1)
    expect(result.seo).toEqual([])
    expect(result.totalPage).toBeGreaterThan(0)
    expect(Array.isArray(result.resolvedPosts)).toBe(true)
    expect(Object.keys(result.extra.categoryLinks)).toContain('general')
    expect(result.extra.sidebar.recentComments).toEqual([])
  })

  it('returns the deep-paginated payload (with seo populated) on /page/N', async () => {
    // 10 posts at pageSize 6 fan out to 6 + 4. The home tail-merge
    // guard's threshold is `pageSize - 2 = 4`, and the strict less-than
    // check keeps a tail of exactly 4 on its own page so /page/2 still
    // renders the four-post stub instead of redirecting.
    const result = await loader(
      makeLoaderArgsWithContext({
        request: new Request('http://localhost/page/2'),
        session,
        params: { num: '2' },
      }),
    )

    expect(result.pageNum).toBe(2)
    expect(Array.isArray(result.seo)).toBe(true)
    expect(result.seo.length).toBeGreaterThan(0)
    const canonical = result.seo.find(
      (tag) =>
        tag !== null &&
        typeof tag === 'object' &&
        'tagName' in tag &&
        tag.tagName === 'link' &&
        tag.rel === 'canonical',
    ) as { href: string } | undefined
    expect(canonical?.href).toContain('/page/2')
    const robots = result.seo.find(
      (tag) => tag !== null && typeof tag === 'object' && 'name' in tag && tag.name === 'robots',
    ) as { content: string } | undefined
    expect(robots?.content).toContain('noindex')
  })

  it('redirects /page/N to the last valid page when N overflows', async () => {
    await expect(
      loader(
        makeLoaderArgsWithContext({
          request: new Request('http://localhost/page/9999'),
          session,
          params: { num: '9999' },
        }),
      ),
    ).rejects.toMatchObject({ status: 302 })
  })
})

// Tail-merge guard. The fixture above carries 10 posts at pageSize 6
// so we keep two pages; this describe block re-mocks the catalogue
// with a smaller list to exercise the merge branch.
describe('routes/home loader — tail-merge guard', () => {
  it('absorbs a 1-post tail into the previous page so /page/2 redirects to /', async () => {
    const sevenPosts = makePostList(7, { slug: 'short' })
    mocks.listClientPosts.mockReturnValue(sevenPosts)
    mocks.postCount = 7

    // 7 posts at pageSize 6 naturally split 6 + 1; threshold = 4; merge
    // collapses the trailing single post into page 1 so /page/2 now
    // redirects through the shared overflow handler instead of
    // rendering the orphan card alone.
    await expect(
      loader(
        makeLoaderArgsWithContext({
          request: new Request('http://localhost/page/2'),
          session,
          params: { num: '2' },
        }),
      ),
    ).rejects.toMatchObject({ status: 302 })
  })

  it('returns all posts on / when the merge collapses the full catalogue into one page', async () => {
    const sevenPosts = makePostList(7, { slug: 'short' })
    mocks.listClientPosts.mockReturnValue(sevenPosts)
    mocks.postCount = 7

    const result = await loader(
      makeLoaderArgsWithContext({
        request: new Request('http://localhost/'),
        session,
        params: {},
      }),
    )

    expect(result.totalPage).toBe(1)
    expect(result.pageNum).toBe(1)
    expect(result.resolvedPosts).toHaveLength(7)
  })
})
