import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { RouterContextProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { makePage, makePost, makePostList, makeTag } from '#/_helpers/catalog'
import { makeLoaderArgs, unwrapLoaderData } from '#/_helpers/context'
import { regularSession } from '#/_helpers/session'
import { dbContext, poolContext } from '@/server/domains/auth/context'

// post.detail / page.detail loaders form the most-trafficked SSR endpoints.
// Pin the alias 301 redirect, the page-vs-post-slug fallback redirect, and
// the 404 contracts that protect against catalog drift.

const session = regularSession()
const samplePost = {
  ...makePost({ slug: 'hello', alias: ['hello-old'] }),
  body: [],
  imageSources: [],
}
const samplePage = {
  ...makePage({ slug: 'about' }),
  body: [],
  imageSources: [],
  publishedRevisionId: null,
}
const sampleTag = makeTag({ name: 'typescript', slug: 'typescript' })
const sidebarSamples = makePostList(3, { slug: 'sidebar' })

// catalog/catalog removed; post detail uses findPostBySlug directly, page
// detail uses pages/loader which queries findPublicPostMetaBySlug + findPageBySlug.
vi.mock('@/server/domains/posts/repos/single', () => ({
  findPostBySlug: vi.fn(async (_db: unknown, slug: string) => {
    if (slug === 'hello' || slug === 'hello-old') {
      return samplePost
    }
    return null
  }),
  findPublicPostMetaBySlug: vi.fn(async (_db: unknown, slug: string) => {
    if (slug === 'hello' || slug === 'hello-old') {
      return {
        slug,
        published: true,
        deletedAt: null,
        publishedRevisionId: 1n,
        publishedAt: new Date(),
      }
    }
    return null
  }),
}))
vi.mock('@/server/domains/posts/repos/public-query/listing', () => ({
  listClientPosts: vi.fn(async () => sidebarSamples),
}))
vi.mock('@/server/domains/posts/repos/public-query/featured', () => ({
  selectSidebarPosts: vi.fn(async () => sidebarSamples),
}))
vi.mock('@/server/domains/pages/repo', () => ({
  listPublicPageMetas: vi.fn(async () => []),
  findPageBySlug: vi.fn(async (_db: unknown, slug: string) => {
    if (slug === 'about') {
      return samplePage
    }
    return null
  }),
  buildDbPage: (p: unknown) => p,
}))
vi.mock('@/server/domains/friends/service', () => ({
  listAllFriends: vi.fn(async () => []),
}))
vi.mock('@/server/domains/taxonomies/tags/service', () => ({
  getTagsByNames: vi.fn(async () => [sampleTag]),
  listAllTags: vi.fn(async () => [sampleTag]),
}))
vi.mock('@/shared/types/catalog', async () => {
  const actual = await vi.importActual<typeof import('@/shared/types/catalog')>('@/shared/types/catalog')
  return {
    ...actual,
    toClientPost: (p: unknown) => p,
    toClientPage: (p: unknown) => p,
    toListingPostCard: (p: unknown) => p,
    toDetailPostShell: (p: unknown) => p,
    toDetailPageShell: (p: unknown) => p,
    toSidebarPostLink: (p: unknown) => p,
  }
})

vi.mock('@/ui/pt/render', () => ({
  PortableTextBody: () => null,
}))

vi.mock('@/server/http/loaders/comments', () => ({
  loadDetailPageData: vi.fn(async () => ({
    admin: false,
    likes: { count: 0, liked: false },
    commentData: { totalCount: 0, totalPages: 0, currentPage: 1 },
    commentItems: [],
    currentUser: null,
    recentComments: [],
    pendingComments: [],
  })),
  // The detail loader now reads `loadDetailPageStreaming`; comments ride
  // along as a Promise so the loader can stream them through `<Await>`.
  loadDetailPageStreaming: vi.fn(async () => ({
    critical: {
      admin: false,
      likes: { count: 0, liked: false },
      currentUser: null,
      commentKey: 'https://example.com/posts/hello/',
      recentComments: [],
      pendingComments: [],
    },
    comments: Promise.resolve({
      commentData: { totalCount: 0, totalPages: 0, currentPage: 1 },
      commentItems: [],
    }),
  })),
}))

const postRoute = await import('@/routes/public/post/detail')
const pageRoute = await import('@/routes/public/page/detail')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('routes/post.detail loader', () => {
  it('301-redirects from a post alias to the canonical slug', async () => {
    await expect(
      postRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/posts/hello-old'),
          session,
          params: { slug: 'hello-old' },
        }),
      ),
    ).rejects.toMatchObject({ status: 301 })
  })

  it("404s when the slug isn't a known post or alias", async () => {
    await expect(
      postRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/posts/missing'),
          session,
          params: { slug: 'missing' },
        }),
      ),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('404s when the slug is missing and no session context is present', async () => {
    const context = new RouterContextProvider()
    context.set(dbContext, {} as NodePgDatabase)
    context.set(poolContext, {} as Pool)

    await expect(
      postRoute.loader({
        request: new Request('http://localhost/posts/missing'),
        context,
        params: { slug: 'missing' },
      } as unknown as Parameters<typeof postRoute.loader>[0]),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('returns the canonical post payload for a real slug', async () => {
    const data = unwrapLoaderData<{
      post: { title: string; permalink: string }
      body: unknown[]
    }>(
      await postRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/posts/hello'),
          session,
          params: { slug: 'hello' },
        }),
      ),
    )

    expect(data.post.title).toBe(samplePost.title)
    expect(data.post.permalink).toBe('/posts/hello')
    expect(data.body).toEqual([])
  })
})

describe('routes/page.detail loader', () => {
  it('returns the canonical page payload for a real page slug', async () => {
    const data = unwrapLoaderData<{ page: { permalink: string } }>(
      await pageRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/about'),
          session,
          params: { slug: 'about' },
        }),
      ),
    )

    expect(data.page.permalink).toBe('/about')
  })

  it('falls back to resolving the request session when detail loaders receive an empty context', async () => {
    const ctx = new RouterContextProvider()
    ctx.set(dbContext, {} as NodePgDatabase)
    ctx.set(poolContext, {} as Pool)
    const data = unwrapLoaderData<{ page: { permalink: string } }>(
      await pageRoute.loader({
        request: new Request('http://localhost/about'),
        context: ctx,
        params: { slug: 'about' },
      } as unknown as Parameters<typeof pageRoute.loader>[0]),
    )

    expect(data.page.permalink).toBe('/about')
  })

  it('301-redirects to /posts/:slug when a page slug actually belongs to a post', async () => {
    try {
      await pageRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/hello'),
          session,
          params: { slug: 'hello' },
        }),
      )
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(Response)
      const response = err as Response
      expect(response.status).toBe(301)
      expect(response.headers.get('Location')).toBe('/posts/hello')
    }
  })

  it('404s when neither page nor post matches the slug', async () => {
    await expect(
      pageRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/missing'),
          session,
          params: { slug: 'missing' },
        }),
      ),
    ).rejects.toMatchObject({ status: 404 })
  })
})
