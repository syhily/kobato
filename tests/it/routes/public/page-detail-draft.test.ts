import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PortableTextBody } from '@/shared/pt/schema'

import { makePage } from '#/_helpers/catalog'
import { makeLoaderArgs, unwrapLoaderData } from '#/_helpers/context'
import { adminSession, regularSession } from '#/_helpers/session'

// Draft-preview contract for `routes/page.detail`. Three states the
// route distinguishes via the `draftMarker` discriminator on the
// loader payload (and propagated to `PageDetailBody`):
//
//   - `'draft'`              — page is unpublished; admin sees the
//                              latest draft on the public URL.
//   - `'unpublished-draft'`  — published page + `?draft=true` + a
//                              newer draft revision exists. Body
//                              swaps to the draft.
//   - `'published-draft'`    — published page + `?draft=true` but no
//                              newer draft. Body stays on the
//                              published revision; the badge confirms
//                              parity.
//
// Anonymous visitors (and non-admin sessions) are never allowed to
// trip these branches: `?draft=true` is silently ignored, and an
// unpublished page still 404s.

const publishedBody: PortableTextBody = [
  {
    _type: 'block',
    _key: 'p1',
    style: 'normal',
    children: [{ _type: 'span', _key: 's1', text: 'Published body.' }],
  },
]

const draftBody: PortableTextBody = [
  {
    _type: 'block',
    _key: 'p2',
    style: 'normal',
    children: [{ _type: 'span', _key: 's2', text: 'Draft body.' }],
  },
]

const publishedPage = {
  ...makePage({ slug: 'about', title: 'About', permalink: '/about' }),
  body: publishedBody,
  imageSources: [],
  publishedRevisionId: 42,
}

const unpublishedPage = {
  ...makePage({ slug: 'secret', title: 'Secret', permalink: '/secret' }),
  body: draftBody,
  imageSources: [],
  publishedRevisionId: null,
}

let currentSession = regularSession()

vi.mock('@/server/domains/pages/repo', () => ({
  findPageMetaById: vi.fn(async () => null),
  findPageMetaBySlug: vi.fn(async () => null),
  findPageMetaBySlugForUpdate: vi.fn(async () => null),
  insertPageMeta: vi.fn(async () => null),
  updatePageMetaById: vi.fn(async () => null),
  softDeletePageMeta: vi.fn(async () => false),
  restorePageMeta: vi.fn(async () => false),
}))
vi.mock('@/server/domains/pages/services/public-query', () => ({
  listPublicPageMetas: vi.fn(async () => []),
  findPublicPageMetaBySlug: vi.fn(async () => null),
  findPageBySlug: vi.fn(async (_db: unknown, slug: string) => (slug === 'about' ? publishedPage : null)),
}))
vi.mock('@/server/domains/posts/services/public-query', () => ({}))
vi.mock('@/server/domains/posts/services/single', () => ({
  findPostMetaById: vi.fn(async () => null),
  findPostMetaBySlug: vi.fn(async () => null),
  findPostMetaBySlugForUpdate: vi.fn(async () => null),
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

vi.mock('@/server/domains/content/lifecycle', () => ({
  loadDraftPreviewBySlug: vi.fn(),
}))

vi.mock('@/server/http/loaders/comments', () => ({
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

vi.mock('@/server/domains/images/services/enhance', () => ({
  resolveImageMetaBySources: vi.fn(async () => new Map()),
}))

const pageRoute = await import('@/routes/public/page/detail')
const lifecycle = await import('@/server/domains/content/lifecycle')
const draftPreviewMock = vi.mocked(lifecycle.loadDraftPreviewBySlug)

type LoaderResult = {
  page: { title: string }
  body: PortableTextBody
  draftMarker: 'draft' | 'unpublished-draft' | 'published-draft' | null
}

beforeEach(() => {
  vi.clearAllMocks()
  currentSession = regularSession()
})

describe('routes/page.detail draft preview', () => {
  it('serves the published body without a marker for anonymous visitors', async () => {
    const result = unwrapLoaderData<LoaderResult>(
      await pageRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/about'),
          session: currentSession,
          params: { slug: 'about' },
        }),
      ),
    )

    expect(result.body).toEqual(publishedBody)
    expect(result.draftMarker).toBeNull()
    expect(draftPreviewMock).not.toHaveBeenCalled()
  })

  it('ignores `?draft=true` for anonymous visitors on a published page', async () => {
    const result = unwrapLoaderData<LoaderResult>(
      await pageRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/about?draft=true'),
          session: currentSession,
          params: { slug: 'about' },
        }),
      ),
    )

    expect(result.body).toEqual(publishedBody)
    expect(result.draftMarker).toBeNull()
    // The service is consulted only after we confirm the session is
    // an admin's. For non-admin requests we never even reach it.
    expect(draftPreviewMock).not.toHaveBeenCalled()
  })

  it('404s anonymous visitors on an unpublished page', async () => {
    let thrown: unknown
    try {
      await pageRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/secret'),
          session: currentSession,
          params: { slug: 'secret' },
        }),
      )
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(Response)
    expect((thrown as Response).status).toBe(404)
    expect(draftPreviewMock).not.toHaveBeenCalled()
  })

  it('shows 【草稿】 for an admin viewing an unpublished page', async () => {
    currentSession = adminSession()
    draftPreviewMock.mockResolvedValueOnce({ preview: unpublishedPage, hasNewerDraft: true })

    const result = unwrapLoaderData<LoaderResult>(
      await pageRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/secret'),
          session: currentSession,
          params: { slug: 'secret' },
        }),
      ),
    )

    expect(result.body).toEqual(draftBody)
    expect(result.draftMarker).toBe('draft')
  })

  it('shows 【未发布的草稿】 for an admin opening a published page with `?draft=true` when a newer draft exists', async () => {
    currentSession = adminSession()
    // The service projects the meta + latest draft into a `Page`
    // whose `body` is the draft. The route then swaps `sourcePage`
    // to that projection so the rendered body is the draft one.
    draftPreviewMock.mockResolvedValueOnce({
      preview: { ...publishedPage, body: draftBody },
      hasNewerDraft: true,
    })

    const result = unwrapLoaderData<LoaderResult>(
      await pageRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/about?draft=true'),
          session: currentSession,
          params: { slug: 'about' },
        }),
      ),
    )

    expect(result.body).toEqual(draftBody)
    expect(result.draftMarker).toBe('unpublished-draft')
  })

  it('shows 【已发布的草稿】 when an admin opens a published page with `?draft=true` and there is no newer draft', async () => {
    currentSession = adminSession()
    draftPreviewMock.mockResolvedValueOnce({
      preview: publishedPage,
      hasNewerDraft: false,
    })

    const result = unwrapLoaderData<LoaderResult>(
      await pageRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/about?draft=true'),
          session: currentSession,
          params: { slug: 'about' },
        }),
      ),
    )

    // No newer draft → body stays on the published revision.
    expect(result.body).toEqual(publishedBody)
    expect(result.draftMarker).toBe('published-draft')
  })

  it('does not paint a marker on a published page when `?draft=true` is absent (admin session)', async () => {
    currentSession = adminSession()

    const result = unwrapLoaderData<LoaderResult>(
      await pageRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/about'),
          session: currentSession,
          params: { slug: 'about' },
        }),
      ),
    )

    expect(result.body).toEqual(publishedBody)
    expect(result.draftMarker).toBeNull()
    // No catalog miss, no `?draft=true` → the service is not even
    // consulted on the warm path.
    expect(draftPreviewMock).not.toHaveBeenCalled()
  })
})
