import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PortableTextBody } from '@/shared/pt/schema'

import { makePage } from './_helpers/catalog'
import { makeLoaderArgs, unwrapLoaderData } from './_helpers/context'
import { regularSession } from './_helpers/session'

// Pages live exclusively in the `page` + `content` Postgres tables,
// so this test pins the contract that the `page.detail` loader
// returns the row's PortableText body straight through (the React
// component renders it via `<PortableTextBody>`).

const session = regularSession()

const dbPageBody: PortableTextBody = [
  {
    _type: 'block',
    _key: 'h1',
    style: 'h2',
    children: [{ _type: 'span', _key: 'h1s', text: 'About' }],
  },
  {
    _type: 'block',
    _key: 'p1',
    style: 'normal',
    children: [{ _type: 'span', _key: 'p1s', text: 'Hello from a DB-backed page.' }],
  },
  {
    _type: 'image',
    _key: 'img1',
    src: 'https://cdn.example.com/photo.jpg',
    alt: 'demo',
  },
  {
    _type: 'musicPlayer',
    _key: 'mp1',
    playerId: 'abcd1234efgh5678',
  },
]

const dbPage = {
  ...makePage({
    slug: 'about',
    title: 'About',
    permalink: '/about',
    cover: '/images/about.jpg',
    comments: false,
    toc: false,
  }),
  body: dbPageBody,
  imageSources: ['https://cdn.example.com/photo.jpg'],
  publishedRevisionId: 42n,
}

// catalog/catalog removed; pages/loader uses findPublicPostMetaBySlug + findPageBySlug.
vi.mock('@/server/domains/pages/repo', () => ({
  listPublicPageMetas: vi.fn(async () => []),
  findPageBySlug: vi.fn(async (_db: unknown, slug: string) => (slug === 'about' ? dbPage : null)),
  buildDbPage: (p: unknown) => p,
}))
vi.mock('@/server/domains/posts/repos/public-query', () => ({
  listPublicPostMetas: vi.fn(async () => []),
}))
vi.mock('@/server/domains/posts/repos/single', () => ({
  findPostBySlug: vi.fn(async () => null),
  findPublicPostMetaBySlug: vi.fn(async () => null),
}))
vi.mock('@/server/domains/friends/service', () => ({
  listAllFriends: vi.fn(async () => []),
}))
vi.mock('@/shared/types/catalog', async () => {
  const actual = await vi.importActual<typeof import('@/shared/types/catalog')>('@/shared/types/catalog')
  return {
    ...actual,
    toClientPage: (p: unknown) => p,
    toDetailPageShell: (p: unknown) => p,
    toDetailPostShell: (p: unknown) => p,
  }
})

// Stub out the comments/data loader the same way `route.detail.test.ts`
// does — the page.detail route awaits this for every request and we
// don't have Postgres in unit tests.
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
  loadDetailPageStreaming: vi.fn(async () => ({
    critical: {
      admin: false,
      likes: { count: 0, liked: false },
      currentUser: null,
      commentKey: 'https://example.com/about/',
      recentComments: [],
      pendingComments: [],
    },
    comments: Promise.resolve({
      commentData: { totalCount: 0, totalPages: 0, currentPage: 1 },
      commentItems: [],
    }),
  })),
}))

// Image-meta resolution would otherwise hit Postgres for the
// thumbhash lookup; we don't need it for this contract.
vi.mock('@/server/render/image-enhance', () => ({
  resolveImageMetaBySources: vi.fn(async () => new Map()),
  loadImageThumbhash: vi.fn(async () => null),
}))

const pageRoute = await import('@/routes/public/page/detail')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('routes/page.detail loader (DB-backed page)', () => {
  it('returns the page row body as PortableText', async () => {
    const result = unwrapLoaderData<{
      page: { permalink: string; title: string }
      body: PortableTextBody
      imageMeta: Record<string, unknown>
    }>(
      await pageRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/about'),
          session,
          params: { slug: 'about' },
        }),
      ),
    )

    expect(result.page.permalink).toBe('/about')
    // The PortableText body shape is preserved end-to-end.
    expect(result.body).toEqual(dbPageBody)
    // Image meta resolution still happens (mocked to empty), proving
    // the loader doesn't short-circuit it for DB pages.
    expect(result.imageMeta).toEqual({})
  })

  it('preserves headings + permalink so SEO + URL-stable consumers keep working', async () => {
    const result = unwrapLoaderData<{
      page: { headings: unknown[]; permalink: string; title: string }
    }>(
      await pageRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/about'),
          session,
          params: { slug: 'about' },
        }),
      ),
    )

    expect(result.page.permalink).toBe('/about')
    expect(result.page.title).toBe('About')
    expect(Array.isArray(result.page.headings)).toBe(true)
  })
})
