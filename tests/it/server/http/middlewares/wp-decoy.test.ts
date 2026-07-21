import { beforeEach, describe, expect, it, vi } from 'vitest'

import { makePage, makePost } from '#/_helpers/catalog'
import { makeLoaderArgs, unwrapLoaderData } from '#/_helpers/context'
import { regularSession } from '#/_helpers/session'
import { isWordPressDecoyPath } from '@/server/http/middlewares/wp-decoy'

// WordPress probe decoy contract. Two things under test:
//   1. `isWordPressDecoyPath` — pure predicate matching the patterns the
//      project agreed to intercept. The Hono wp-decoy middleware is the
//      single chokepoint that runs this predicate before any route
//      loader and answers hits with the canonical `404 Not WordPress`.
//   2. `routes/page.detail.tsx` — sanity check that real page slugs still
//      resolve through the page-detail loader (the middleware is what
//      handles probes; the loader never re-checks).

const session = regularSession()

const fixtures = vi.hoisted(() => ({
  samplePost: { slug: 'hello', mdxPath: '2024/2024-01-01-hello.mdx' } as Record<string, unknown>,
  samplePage: { slug: 'about' } as Record<string, unknown>,
}))
fixtures.samplePost = {
  ...makePost({ slug: 'hello', alias: ['hello-old'] }),
  mdxPath: '2024/2024-01-01-hello.mdx',
  body: () => null,
  imageSources: [],
}
fixtures.samplePage = {
  ...makePage({ slug: 'about' }),
  body: [],
  imageSources: [],
  publishedRevisionId: null,
}

// catalog/catalog removed; pages/loader.ts now uses findPublicPostMetaBySlug +
// findPageBySlug directly. Catalog slug routing is gone.
vi.mock('@/server/domains/posts/repos/public-query/listing', () => ({}))
vi.mock('@/server/domains/posts/repos/single', () => ({
  findPostBySlug: vi.fn(async (_db: unknown, slug: string) => (slug === 'hello' ? fixtures.samplePost : null)),
  findPublicPostMetaBySlug: vi.fn(async (_db: unknown, slug: string) =>
    slug === 'hello'
      ? { slug, published: true, deletedAt: null, publishedRevisionId: 1n, publishedAt: new Date() }
      : null,
  ),
}))
vi.mock('@/server/domains/pages/repo', () => ({
  listPublicPageMetas: vi.fn(async () => []),
  findPageMetaById: vi.fn(async () => null),
  findPublicPageMetaBySlug: vi.fn(async () => null),
  findPageBySlug: vi.fn(async (_db: unknown, slug: string) => (slug === 'about' ? fixtures.samplePage : null)),
}))
vi.mock('@/server/domains/friends/service', () => ({
  listAllFriends: vi.fn(async () => []),
}))
vi.mock('@/shared/types/catalog', async () => {
  const actual = await vi.importActual<typeof import('@/shared/types/catalog')>('@/shared/types/catalog')
  return {
    ...actual,
    toClientPost: (p: unknown) => p,
    toClientPage: (p: unknown) => p,
    toDetailPostShell: (p: unknown) => p,
    toDetailPageShell: (p: unknown) => p,
    toSidebarPostLink: (p: unknown) => p,
  }
})

vi.mock('@/ui/pt/render', () => ({
  PortableTextBody: () => null,
}))

vi.mock('@/server/http/loaders/comments', () => ({
  // The detail loader streams comments through `<Await>`; mock the
  // streaming helper so the page-detail route resolves under test.
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

const pageDetailRoute = await import('@/routes/public/page/detail')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('isWordPressDecoyPath', () => {
  it('matches WordPress probe patterns', () => {
    const probes = [
      '/admin/options.php',
      '/admin/setup-config.php',
      '/wp-content/plugins/x.php',
      '/wp-content/uploads/img.jpg',
      '/wp-includes/wlwmanifest.xml',
      '/cgi-bin',
      '/cgi-bin/test.cgi',
      '/xmlrpc.php',
      '/index.php',
      '/blog/index.php',
    ]
    for (const path of probes) {
      expect(isWordPressDecoyPath(path), path).toBe(true)
    }
  })

  it('preserves the legitimate WordPress-style routes (login, install, SPA shell)', () => {
    expect(isWordPressDecoyPath('/admin/signin')).toBe(false)
    expect(isWordPressDecoyPath('/admin')).toBe(false)
    // The one-step install route. It ends in `.php` so without an
    // explicit allow list the decoy filter would happily 404 it.
    expect(isWordPressDecoyPath('/admin/setup')).toBe(false)
    // The admin SPA is mounted at `/admin/<page>` and `/admin/<page>/:id`;
    // it shares the WordPress URL shape on purpose so admins can keep their muscle
    // memory. Paths under that prefix that don't end in `.php` are SPA routes,
    // not scanner probes.
    expect(isWordPressDecoyPath('/admin/comments')).toBe(false)
    expect(isWordPressDecoyPath('/admin/security/users')).toBe(false)
    expect(isWordPressDecoyPath('/admin/security/users/12345')).toBe(false)
  })

  it('ignores unrelated paths', () => {
    const ordinary = [
      '/',
      '/posts/hello',
      '/about',
      '/cats/general',
      '/tags/typescript',
      '/search/foo',
      '/feed',
      '/sitemap.xml',
      '/cgi-binx',
      '/adminx',
    ]
    for (const path of ordinary) {
      expect(isWordPressDecoyPath(path), path).toBe(false)
    }
  })
})

describe('routes/page.detail loader (probe interception lives in the middleware)', () => {
  it('still serves real page slugs', async () => {
    const data = unwrapLoaderData<{ page: { permalink: string } }>(
      await pageDetailRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/about'),
          session,
          params: { slug: 'about' },
        }),
      ),
    )
    expect(data.page.permalink).toBe('/about')
  })
})
