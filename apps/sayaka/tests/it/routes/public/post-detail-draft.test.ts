import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { ORPCError } from '@orpc/contract'
import { loader } from '@sayaka/routes/post/detail'
import {
  createStubKobato,
  loaderData,
  loaderHeaders,
  makeSayakaLoaderArgs,
  type StubKobato,
} from '@sayaka/tests/utils/stub-kobato'
import { describe, expect, it } from 'vitest'

function makePayload(overrides: Record<string, unknown> = {}) {
  return unsafeCast<Record<string, unknown>>({
    post: { title: 'Hello Post', slug: 'hello-post', permalink: '/posts/hello-post', headings: [], lang: 'zh-CN' },
    bodyHtml: '<p>body</p>',
    visibleTags: [],
    sidebarPosts: [],
    tags: [],
    critical: { commentKey: 'post:1', likes: 0, admin: false, currentUser: null, recentComments: [] },
    draftMarker: null,
    ...overrides,
  })
}

function stubWith(payload: Record<string, unknown>, etag: string | null = null): StubKobato {
  return createStubKobato({
    'public.content.posts.bySlug': () => ({ kind: 'ok', etag, payload }),
    'public.content.comments.byKey': () => ({ comments: [], totalCount: 0 }),
    'public.webmentions.list': () => ({ webmentions: [] }),
  })
}

function notFoundStub(): StubKobato {
  return createStubKobato({
    'public.content.posts.bySlug': () => {
      throw new ORPCError('NOT_FOUND', { message: 'missing' })
    },
    'public.content.comments.byKey': () => ({ comments: [], totalCount: 0 }),
    'public.webmentions.list': () => ({ webmentions: [] }),
  })
}

function args(stub: StubKobato, slug: string): Parameters<typeof loader>[0] {
  return unsafeCast<Parameters<typeof loader>[0]>(
    makeSayakaLoaderArgs({ stub, request: new Request(`http://localhost/posts/${slug}`), params: { slug } }).args,
  )
}

describe('routes/post.detail draft visibility', () => {
  it('serves the published post for anonymous visitors', async () => {
    const stub = stubWith(makePayload())

    const result = loaderData<Record<string, unknown>>(await loader(args(stub, 'hello-post')))
    expect(result.draftMarker).toBeNull()
    expect(unsafeCast<{ slug: string }>(result.post).slug).toBe('hello-post')
  })

  it('404s anonymous visitors on a draft post (status=draft)', async () => {
    await expect(loader(args(notFoundStub(), 'draft-post'))).rejects.toMatchObject({ status: 404 })
  })

  it('404s anonymous visitors on a post with status=published but no published revision', async () => {
    await expect(loader(args(notFoundStub(), 'no-revision'))).rejects.toMatchObject({ status: 404 })
  })

  it('404s regular logged-in visitors on a draft post', async () => {
    await expect(loader(args(notFoundStub(), 'draft-post'))).rejects.toMatchObject({ status: 404 })
  })

  it('relays 【草稿】 for an admin viewing another author’s draft', async () => {
    const stub = stubWith(makePayload({ draftMarker: 'draft' }))

    const result = loaderData<Record<string, unknown>>(await loader(args(stub, 'draft-post')))
    expect(result.draftMarker).toBe('draft')
  })

  it('relays 【草稿】 for an author viewing their own draft', async () => {
    const stub = stubWith(makePayload({ draftMarker: 'draft' }))

    const result = loaderData<Record<string, unknown>>(await loader(args(stub, 'own-draft')))
    expect(result.draftMarker).toBe('draft')
  })

  it('404s an author viewing another author’s draft', async () => {
    await expect(loader(args(notFoundStub(), 'other-draft'))).rejects.toMatchObject({ status: 404 })
  })

  it('404s an author on an orphaned draft (authorId null)', async () => {
    await expect(loader(args(notFoundStub(), 'orphan-draft'))).rejects.toMatchObject({ status: 404 })
  })

  it('relays the on-read projection when the draft row carries a computed body_html', async () => {
    const stub = stubWith(makePayload({ draftMarker: 'draft', bodyHtml: '<p>computed on read</p>' }))

    const result = loaderData<Record<string, unknown>>(await loader(args(stub, 'draft-post')))
    expect(result.bodyHtml).toBe('<p>computed on read</p>')
  })

  it('does not paint a marker on a published post (admin session)', async () => {
    const stub = stubWith(makePayload())

    const result = loaderData<Record<string, unknown>>(await loader(args(stub, 'hello-post')))
    expect(result.draftMarker).toBeNull()
  })

  it('never stamps an ETag on a draft preview', async () => {
    const stub = stubWith(makePayload({ draftMarker: 'draft' }), null)

    const result = await loader(args(stub, 'draft-post'))
    expect(loaderHeaders(result).ETag).toBeUndefined()
  })
})
