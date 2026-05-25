import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  assertNotWordPressDecoy,
  isWordPressDecoyPath,
  NOT_WORDPRESS_STATUS_TEXT,
  notWordPressSite,
} from '@/server/http/middlewares/wp-decoy'

import { makePage, makePost } from './_helpers/catalog'
import { makeLoaderArgs, unwrapLoaderData } from './_helpers/context'
import { regularSession } from './_helpers/session'

// WordPress probe decoy contract. Three layers under test:
//   1. `isWordPressDecoyPath` — pure predicate matching the patterns the
//      project agreed to intercept.
//   2. `wpDecoyMiddleware` — the single chokepoint that runs on the root
//      route before any other loader, throwing the canonical `404`
//      Response carrying the `Not WordPress` marker.
//   3. `routes/page.detail.tsx` — sanity check that real page slugs still
//      resolve through the page-detail loader (the middleware is what
//      handles probes; the loader no longer re-checks).

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
vi.mock('@/server/domains/posts/repos/public-query', () => ({
  listPublicPostMetas: vi.fn(async () => []),
}))
vi.mock('@/server/domains/posts/repos/single', () => ({
  findPostBySlug: vi.fn(async (slug: string) => (slug === 'hello' ? fixtures.samplePost : null)),
  findPublicPostMetaBySlug: vi.fn(async (slug: string) =>
    slug === 'hello'
      ? { slug, published: true, deletedAt: null, publishedRevisionId: 1n, publishedAt: new Date() }
      : null,
  ),
}))
vi.mock('@/server/domains/pages/repo', () => ({
  listPublicPageMetas: vi.fn(async () => []),
  findPageBySlug: vi.fn(async (slug: string) => (slug === 'about' ? fixtures.samplePage : null)),
  buildDbPage: (p: unknown) => p,
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
  loadDetailPageData: vi.fn(async () => ({
    admin: false,
    likes: { count: 0, liked: false },
    commentData: { totalCount: 0, totalPages: 0, currentPage: 1 },
    commentItems: [],
    currentUser: null,
    recentComments: [],
    pendingComments: [],
  })),
  // The detail loader streams comments through `<Await>`; mock the streaming
  // helper as well so the page-detail route resolves under test.
  loadDetailPageStreaming: vi.fn(async () => ({
    critical: {
      admin: false,
      likes: { count: 0, liked: false },
      currentUser: null,
      commentKey: 'https://yufan.me/about/',
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

// Loaders / middlewares may be synchronous or async. Wrap the call in a
// thunk so the try/catch catches both styles uniformly.
async function captureThrown(call: () => unknown): Promise<unknown> {
  try {
    await call()
  } catch (err) {
    return err
  }
  throw new Error('expected call to throw')
}

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

describe('notWordPressSite', () => {
  it('throws a 404 Response tagged with the Not WordPress marker', () => {
    let thrown: unknown
    try {
      notWordPressSite()
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(Response)
    const response = thrown as Response
    expect(response.status).toBe(404)
    expect(response.statusText).toBe(NOT_WORDPRESS_STATUS_TEXT)
  })
})

describe('assertNotWordPressDecoy (single-segment + multi-segment probes)', () => {
  it('throws the WP-decoy 404 for multi-segment probe paths', async () => {
    const thrown = await captureThrown(() =>
      assertNotWordPressDecoy(new Request('http://localhost/wp-content/plugins/foo.php')),
    )
    expect(thrown).toBeInstanceOf(Response)
    expect((thrown as Response).status).toBe(404)
    expect((thrown as Response).statusText).toBe(NOT_WORDPRESS_STATUS_TEXT)
  })

  it('throws the WP-decoy 404 for single-segment .php probes', async () => {
    const thrown = await captureThrown(() => assertNotWordPressDecoy(new Request('http://localhost/xmlrpc.php')))
    expect(thrown).toBeInstanceOf(Response)
    expect((thrown as Response).status).toBe(404)
    expect((thrown as Response).statusText).toBe(NOT_WORDPRESS_STATUS_TEXT)
  })

  it('throws the WP-decoy 404 for the bare /cgi-bin segment', async () => {
    const thrown = await captureThrown(() => assertNotWordPressDecoy(new Request('http://localhost/cgi-bin')))
    expect(thrown).toBeInstanceOf(Response)
    expect((thrown as Response).status).toBe(404)
    expect((thrown as Response).statusText).toBe(NOT_WORDPRESS_STATUS_TEXT)
  })

  it('returns silently for ordinary paths', () => {
    expect(() => assertNotWordPressDecoy(new Request('http://localhost/posts/hello'))).not.toThrow()
  })
})

describe('routes/page.detail loader (probe interception lives in the loader)', () => {
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
