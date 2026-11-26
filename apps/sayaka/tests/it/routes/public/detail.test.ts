import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { ORPCError } from '@orpc/contract'
import { loader as pageLoader } from '@sayaka/routes/page/detail'
import { loader as postLoader } from '@sayaka/routes/post/detail'
import {
  createStubKobato,
  loaderData,
  loaderHeaders,
  makeSayakaLoaderArgs,
  stubCallsFor,
  STUB_BOOTSTRAP,
  type StubKobato,
} from '@sayaka/tests/utils/stub-kobato'
import { describe, expect, it } from 'vitest'

const DETAIL_ETAG = 'W/"1111222233334444"'

function makePostPayload(overrides: Record<string, unknown> = {}) {
  return unsafeCast<Record<string, unknown>>({
    post: {
      title: 'Hello Post',
      slug: 'hello-post',
      permalink: '/posts/hello-post',
      headings: [],
      lang: 'zh-CN',
    },
    bodyHtml: '<p>body</p>',
    visibleTags: ['test'],
    sidebarPosts: [],
    tags: [],
    critical: {
      commentKey: 'post:1',
      likes: 3,
      admin: false,
      currentUser: null,
      recentComments: [],
    },
    draftMarker: null,
    ...overrides,
  })
}

function makePagePayload(overrides: Record<string, unknown> = {}) {
  return unsafeCast<Record<string, unknown>>({
    page: {
      title: 'About',
      slug: 'about',
      permalink: '/about',
      headings: [],
      lang: 'zh-CN',
    },
    bodyHtml: '<p>page body</p>',
    friends: [],
    showFriends: false,
    critical: {
      commentKey: 'page:1',
      likes: 0,
      admin: false,
      currentUser: null,
      recentComments: [],
    },
    draftMarker: null,
    ...overrides,
  })
}

function detailHandlers(
  path: string,
  payload: Record<string, unknown>,
  etag: string | null = DETAIL_ETAG,
): Parameters<typeof createStubKobato>[0] {
  return {
    [path]: () => ({ kind: 'ok', etag, payload }),
    'public.content.comments.byKey': () => ({ comments: [{ id: 1 }], totalCount: 1 }),
    'public.webmentions.list': () => ({ webmentions: [{ id: 'wm-1' }] }),
  }
}

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
function args<T>(stub: StubKobato, request: Request, params: Record<string, string>): T {
  return unsafeCast<T>(makeSayakaLoaderArgs({ stub, request, params }).args)
}

describe('routes/post.detail loader', () => {
  it('301-redirects a post alias to the canonical slug', async () => {
    const stub = createStubKobato({
      'public.content.posts.bySlug': () => ({ kind: 'redirect', to: '/posts/canonical', status: 301 }),
    })

    const error = await postLoader(args(stub, new Request('http://localhost/posts/alias'), { slug: 'alias' })).then(
      () => null,
      (thrown: unknown) => thrown,
    )
    expect(error).toBeInstanceOf(Response)
    const response = unsafeCast<Response>(error)
    expect(response.status).toBe(301)
    expect(response.headers.get('location')).toBe('/posts/canonical')
  })

  it("404s when the slug isn't a known post", async () => {
    const stub = createStubKobato({
      'public.content.posts.bySlug': () => {
        throw new ORPCError('NOT_FOUND', { message: 'missing' })
      },
    })

    await expect(
      postLoader(args(stub, new Request('http://localhost/posts/missing'), { slug: 'missing' })),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('never fires the comment/webmention extras on a miss', async () => {
    const stub = createStubKobato({
      'public.content.posts.bySlug': () => {
        throw new ORPCError('NOT_FOUND', { message: 'missing' })
      },
      'public.content.comments.byKey': () => ({ comments: [], totalCount: 0 }),
      'public.webmentions.list': () => ({ webmentions: [] }),
    })

    await expect(
      postLoader(args(stub, new Request('http://localhost/posts/missing'), { slug: 'missing' })),
    ).rejects.toMatchObject({ status: 404 })
    expect(stubCallsFor(stub, 'public.content.comments.byKey')).toHaveLength(0)
    expect(stubCallsFor(stub, 'public.webmentions.list')).toHaveLength(0)
  })

  it('returns the canonical post payload for a real slug', async () => {
    const stub = createStubKobato(detailHandlers('public.content.posts.bySlug', makePostPayload()))

    const result = loaderData<Record<string, unknown> & { eid: string; detail: Record<string, unknown> }>(
      await postLoader(args(stub, new Request('http://localhost/posts/hello-post'), { slug: 'hello-post' })),
    )

    expect(unsafeCast<{ slug: string }>(result.post).slug).toBe('hello-post')
    expect(result.bodyHtml).toBe('<p>body</p>')
    expect(result.visibleTags).toEqual(['test'])
    expect(result.draftMarker).toBeNull()
    expect(result.eid).toMatch(/^[0-9a-f-]{36}$/)

    const comments = await unsafeCast<Promise<unknown>>(result.detail.comments)
    expect(comments).toEqual({ comments: [{ id: 1 }], totalCount: 1 })
    const webmentions = await unsafeCast<Promise<unknown>>(result.detail.webmentions)
    expect(webmentions).toEqual([{ id: 'wm-1' }])

    const commentCalls = stubCallsFor(stub, 'public.content.comments.byKey')
    expect(commentCalls[0]?.input).toEqual({ pageKey: 'post:1' })
    const mentionCalls = stubCallsFor(stub, 'public.webmentions.list')
    expect(mentionCalls[0]?.input).toEqual({ page_key: 'post:1' })
  })

  it('stamps the representation ETag on the ok branch', async () => {
    const stub = createStubKobato(detailHandlers('public.content.posts.bySlug', makePostPayload()))

    const result = await postLoader(
      args(stub, new Request('http://localhost/posts/hello-post'), { slug: 'hello-post' }),
    )
    expect(loaderHeaders(result).ETag).toBe(DETAIL_ETAG)
  })

  it('starts the detail call before the bootstrap resolves', async () => {
    let releaseBootstrap: ((value: unknown) => void) | null = null
    const stub = createStubKobato({
      'public.content.bootstrap': () =>
        new Promise((resolve) => {
          releaseBootstrap = resolve
        }),
      ...detailHandlers('public.content.posts.bySlug', makePostPayload()),
    })

    const pending = postLoader(args(stub, new Request('http://localhost/posts/hello-post'), { slug: 'hello-post' }))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(stubCallsFor(stub, 'public.content.posts.bySlug')).toHaveLength(1)

    releaseBootstrap!(STUB_BOOTSTRAP)
    await pending
  })
})

describe('routes/post.detail loader — representation ETag', () => {
  it('answers 304 for the same representation with request-localized headers', async () => {
    const stub = createStubKobato({
      'public.content.comments.byKey': () => ({ comments: [], totalCount: 0 }),
      'public.webmentions.list': () => ({ webmentions: [] }),
      'public.content.posts.bySlug': (input) =>
        input.ifNoneMatch === DETAIL_ETAG
          ? { kind: 'not-modified', etag: DETAIL_ETAG }
          : { kind: 'ok', etag: DETAIL_ETAG, payload: makePostPayload() },
    })

    await postLoader(args(stub, new Request('http://localhost/posts/hello-post'), { slug: 'hello-post' }))

    const second = await postLoader(
      args(stub, new Request('http://localhost/posts/hello-post', { headers: { 'If-None-Match': DETAIL_ETAG } }), {
        slug: 'hello-post',
      }),
    ).then(
      () => null,
      (response: unknown) => response,
    )

    expect(second).toBeInstanceOf(Response)
    const response = unsafeCast<Response>(second)
    expect(response.status).toBe(304)
    expect(response.headers.get('ETag')).toBe(DETAIL_ETAG)
    expect(response.headers.get('Content-Language')).toBe('zh-CN')
    expect(response.headers.get('Cache-Control')).toBe('private, no-cache')
    expect(response.headers.get('Vary')).toBe('Cookie')
  })

  it('never stamps or honours a published ETag on a draft preview', async () => {
    const stub = createStubKobato(
      detailHandlers('public.content.posts.bySlug', makePostPayload({ draftMarker: 'draft' }), null),
    )

    const result = await postLoader(
      args(stub, new Request('http://localhost/posts/draft-post'), { slug: 'draft-post' }),
    )
    expect(loaderHeaders(result).ETag).toBeUndefined()
    expect(loaderData<Record<string, unknown>>(result).draftMarker).toBe('draft')
  })

  it('does not short-circuit an alias hit — the canonical 301 still fires', async () => {
    const stub = createStubKobato({
      'public.content.posts.bySlug': () => ({ kind: 'redirect', to: '/posts/canonical', status: 301 }),
    })

    const error = await postLoader(
      args(stub, new Request('http://localhost/posts/alias', { headers: { 'If-None-Match': DETAIL_ETAG } }), {
        slug: 'alias',
      }),
    ).then(
      () => null,
      (thrown: unknown) => thrown,
    )
    expect(unsafeCast<Response>(error).status).toBe(301)
  })
})

describe('routes/page.detail loader', () => {
  it('returns the canonical page payload for a real page slug', async () => {
    const stub = createStubKobato(detailHandlers('public.content.pages.bySlug', makePagePayload()))

    const result = loaderData<Record<string, unknown> & { detail: Record<string, unknown> }>(
      await pageLoader(args(stub, new Request('http://localhost/about'), { slug: 'about' })),
    )

    expect(unsafeCast<{ slug: string }>(result.page).slug).toBe('about')
    expect(result.bodyHtml).toBe('<p>page body</p>')
    expect(result.showFriends).toBe(false)

    const comments = await unsafeCast<Promise<unknown>>(result.detail.comments)
    expect(comments).toEqual({ comments: [{ id: 1 }], totalCount: 1 })
  })

  it('301-redirects to /posts/:slug when a page slug actually belongs to a post', async () => {
    const stub = createStubKobato({
      'public.content.pages.bySlug': () => ({ kind: 'redirect', to: '/posts/hello-post', status: 301 }),
    })

    const error = await pageLoader(args(stub, new Request('http://localhost/hello-post'), { slug: 'hello-post' })).then(
      () => null,
      (thrown: unknown) => thrown,
    )
    const response = unsafeCast<Response>(error)
    expect(response.status).toBe(301)
    expect(response.headers.get('location')).toBe('/posts/hello-post')
  })

  it('404s when neither page nor post matches the slug', async () => {
    const stub = createStubKobato({
      'public.content.pages.bySlug': () => {
        throw new ORPCError('NOT_FOUND', { message: 'missing' })
      },
    })

    await expect(
      pageLoader(args(stub, new Request('http://localhost/missing'), { slug: 'missing' })),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('forwards ?draft=true to kobato and stamps no ETag on the preview', async () => {
    const stub = createStubKobato(
      detailHandlers('public.content.pages.bySlug', makePagePayload({ draftMarker: 'unpublished-draft' }), null),
    )

    const result = await pageLoader(args(stub, new Request('http://localhost/about?draft=true'), { slug: 'about' }))
    expect(stubCallsFor(stub, 'public.content.pages.bySlug')[0]?.input.draft).toBe(true)
    expect(loaderHeaders(result).ETag).toBeUndefined()
  })

  it('forwards draft=false when the query flag is absent', async () => {
    const stub = createStubKobato(detailHandlers('public.content.pages.bySlug', makePagePayload()))

    await pageLoader(args(stub, new Request('http://localhost/about'), { slug: 'about' }))
    expect(stubCallsFor(stub, 'public.content.pages.bySlug')[0]?.input.draft).toBe(false)
  })
})

describe('routes/page.detail loader — friends gating', () => {
  it('relays a hidden friends section untouched', async () => {
    const stub = createStubKobato(
      detailHandlers('public.content.pages.bySlug', makePagePayload({ showFriends: false, friends: [] })),
    )

    const result = loaderData<Record<string, unknown>>(
      await pageLoader(args(stub, new Request('http://localhost/about'), { slug: 'about' })),
    )
    expect(result.showFriends).toBe(false)
    expect(result.friends).toEqual([])
  })

  it('relays the friends list when the page shows the section', async () => {
    const friends = [{ name: 'aya', url: 'https://aya.example' }]
    const stub = createStubKobato(
      detailHandlers('public.content.pages.bySlug', makePagePayload({ showFriends: true, friends })),
    )

    const result = loaderData<Record<string, unknown>>(
      await pageLoader(args(stub, new Request('http://localhost/friends'), { slug: 'friends' })),
    )
    expect(result.showFriends).toBe(true)
    expect(result.friends).toEqual(friends)
  })
})

describe('routes/page.detail loader — representation ETag', () => {
  it('answers 304 for the same representation with request-localized headers', async () => {
    const stub = createStubKobato({
      'public.content.pages.bySlug': (input) =>
        input.ifNoneMatch === DETAIL_ETAG
          ? { kind: 'not-modified', etag: DETAIL_ETAG }
          : { kind: 'ok', etag: DETAIL_ETAG, payload: makePagePayload() },
      'public.content.comments.byKey': () => ({ comments: [], totalCount: 0 }),
      'public.webmentions.list': () => ({ webmentions: [] }),
    })

    await pageLoader(args(stub, new Request('http://localhost/about'), { slug: 'about' }))

    const second = await pageLoader(
      args(stub, new Request('http://localhost/about', { headers: { 'If-None-Match': DETAIL_ETAG } }), {
        slug: 'about',
      }),
    ).then(
      () => null,
      (response: unknown) => response,
    )

    expect(second).toBeInstanceOf(Response)
    const response = unsafeCast<Response>(second)
    expect(response.status).toBe(304)
    expect(response.headers.get('Content-Language')).toBe('zh-CN')
    expect(response.headers.get('Cache-Control')).toBe('private, no-cache')
  })
})
