import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PortableTextBody } from '@/shared/pt/schema'

import { makePost } from '#/_helpers/catalog'
import { makeLoaderArgs, unwrapLoaderData } from '#/_helpers/context'
import { adminSession, authorSession, regularSession } from '#/_helpers/session'

// Draft-preview contract for `routes/post.detail`.
//
//   - `status=draft` posts are invisible to anonymous/regular users (404).
//   - Admin and author users see the draft via `loadDraftPreviewBySlug`

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

const publishedPost = {
  ...makePost({ slug: 'hello', title: 'Hello', permalink: '/posts/hello' }),
  body: publishedBody,
  imageSources: [],
  publishedRevisionId: 42n,
}

const draftPost = {
  ...makePost({
    slug: 'secret',
    title: 'Secret',
    permalink: '/posts/secret',
    published: false,
    visible: false,
  }),
  body: draftBody,
  imageSources: [],
  publishedRevisionId: null,
}

let currentSession = regularSession()

vi.mock('@/server/domains/posts/services/single', () => ({
  findPostMetaById: vi.fn(async () => null),
  findPostMetaBySlug: vi.fn(async () => null),
  findPostMetaBySlugForUpdate: vi.fn(async () => null),
  findPublicPostMetaBySlug: vi.fn(async () => null),
  findPostBySlug: vi.fn(async (_db: unknown, slug: string) => {
    if (slug === 'hello') {
      return publishedPost
    }
    // never-published is status=published but publishedRevisionId=null;
    // the real findPostBySlug now returns null for this case.
    return null
  }),
}))
vi.mock('@/server/domains/posts/services/featured', () => ({
  selectSidebarPosts: vi.fn(async () => []),
}))
vi.mock('@/server/domains/posts/services/public-query', () => ({}))
vi.mock('@/server/domains/taxonomies/tags/service', () => ({
  getTagsByNames: vi.fn(async () => []),
  listAllTags: vi.fn(async () => []),
  selectSidebarTags: vi.fn(async () => []),
}))
vi.mock('@/server/domains/content/lifecycle', () => ({
  loadDraftPreviewBySlug: vi.fn(),
}))
vi.mock('@/shared/types/catalog', async () => {
  const actual = await vi.importActual<typeof import('@/shared/types/catalog')>('@/shared/types/catalog')
  return {
    ...actual,
    toClientPost: (p: unknown) => p,
    toDetailPostShell: (p: unknown) => p,
  }
})

vi.mock('@/server/http/loaders/comments', () => ({
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

vi.mock('@/server/domains/images/services/enhance', () => ({
  resolveImageMetaBySources: vi.fn(async () => new Map()),
}))

const postRoute = await import('@/routes/public/post/detail')
const lifecycle = await import('@/server/domains/content/lifecycle')
const draftPreviewMock = vi.mocked(lifecycle.loadDraftPreviewBySlug)
const postsSingle = await import('@/server/domains/posts/services/single')
const findPostBySlugMock = vi.mocked(postsSingle.findPostBySlug)

type LoaderResult = {
  post: { title: string }
  body: PortableTextBody
  draftMarker: 'draft' | 'unpublished-draft' | 'published-draft' | null
}

beforeEach(() => {
  vi.clearAllMocks()
  currentSession = regularSession()
})

describe('routes/post.detail draft visibility', () => {
  it('serves the published post for anonymous visitors', async () => {
    const result = unwrapLoaderData<LoaderResult>(
      await postRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/posts/hello'),
          session: currentSession,
          params: { slug: 'hello' },
        }),
      ),
    )

    expect(result.body).toEqual(publishedBody)
    expect(result.draftMarker).toBeNull()
    expect(draftPreviewMock).not.toHaveBeenCalled()
  })

  it('404s anonymous visitors on a draft post (status=draft)', async () => {
    let thrown: unknown
    try {
      await postRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/posts/secret'),
          session: currentSession,
          params: { slug: 'secret' },
        }),
      )
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(Response)
    expect((thrown as Response).status).toBe(404)
    expect(findPostBySlugMock).toHaveBeenCalledWith(expect.any(Object), 'secret')
    expect(draftPreviewMock).not.toHaveBeenCalled()
  })

  it('404s anonymous visitors on a post with status=published but no published revision', async () => {
    let thrown: unknown
    try {
      await postRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/posts/never-published'),
          session: currentSession,
          params: { slug: 'never-published' },
        }),
      )
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(Response)
    expect((thrown as Response).status).toBe(404)
    expect(findPostBySlugMock).toHaveBeenCalledWith(expect.any(Object), 'never-published')
    expect(draftPreviewMock).not.toHaveBeenCalled()
  })

  it('404s regular logged-in visitors on a draft post', async () => {
    currentSession = regularSession()
    let thrown: unknown
    try {
      await postRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/posts/secret'),
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

  it('shows 【草稿】 for an admin viewing a draft post', async () => {
    currentSession = adminSession()
    draftPreviewMock.mockResolvedValueOnce({ preview: draftPost, hasNewerDraft: true })

    const result = unwrapLoaderData<LoaderResult>(
      await postRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/posts/secret'),
          session: currentSession,
          params: { slug: 'secret' },
        }),
      ),
    )

    expect(result.body).toEqual(draftBody)
    expect(result.draftMarker).toBe('draft')
    expect(draftPreviewMock).toHaveBeenCalledWith(expect.any(Object), expect.anything(), 'secret')
  })

  it('shows 【草稿】 for an author viewing a draft post', async () => {
    currentSession = authorSession()
    draftPreviewMock.mockResolvedValueOnce({ preview: draftPost, hasNewerDraft: true })

    const result = unwrapLoaderData<LoaderResult>(
      await postRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/posts/secret'),
          session: currentSession,
          params: { slug: 'secret' },
        }),
      ),
    )

    expect(result.body).toEqual(draftBody)
    expect(result.draftMarker).toBe('draft')
    expect(draftPreviewMock).toHaveBeenCalledWith(expect.any(Object), expect.anything(), 'secret')
  })

  it('does not paint a marker on a published post (admin session)', async () => {
    currentSession = adminSession()

    const result = unwrapLoaderData<LoaderResult>(
      await postRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/posts/hello'),
          session: currentSession,
          params: { slug: 'hello' },
        }),
      ),
    )

    expect(result.body).toEqual(publishedBody)
    expect(result.draftMarker).toBeNull()
    expect(draftPreviewMock).not.toHaveBeenCalled()
  })
})
