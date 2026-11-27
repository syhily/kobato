import { unsafeCast } from '@kobato/base/utils/unsafe-cast'
import { ORPCError } from '@orpc/contract'
import { loader } from '@sayaka/routes/page/detail'
import {
  createStubKobato,
  loaderData,
  loaderHeaders,
  makeSayakaLoaderArgs,
  stubCallsFor,
  type StubKobato,
} from '@sayaka/tests/utils/stub-kobato'
import { describe, expect, it } from 'vitest'

function makePayload(overrides: Record<string, unknown> = {}) {
  return unsafeCast<Record<string, unknown>>({
    page: { title: 'About', slug: 'about', permalink: '/about', headings: [], lang: 'zh-CN' },
    bodyHtml: '<p>page body</p>',
    friends: [],
    showFriends: false,
    critical: { commentKey: 'page:1', likes: 0, admin: false, currentUser: null, recentComments: [] },
    draftMarker: null,
    ...overrides,
  })
}

function stubWith(payload: Record<string, unknown>, etag: string | null = null): StubKobato {
  return createStubKobato({
    'public.content.pages.bySlug': () => ({ kind: 'ok', etag, payload }),
    'public.content.comments.byKey': () => ({ comments: [], totalCount: 0 }),
    'public.webmentions.list': () => ({ webmentions: [] }),
  })
}

function args(stub: StubKobato, url: string): Parameters<typeof loader>[0] {
  return unsafeCast<Parameters<typeof loader>[0]>(
    makeSayakaLoaderArgs({ stub, request: new Request(url), params: { slug: 'about' } }).args,
  )
}

describe('routes/page.detail draft preview', () => {
  it('serves the published body without a marker for non-admin visitors', async () => {
    const stub = stubWith(makePayload())

    const result = loaderData<Record<string, unknown>>(await loader(args(stub, 'http://localhost/about')))
    expect(result.draftMarker).toBeNull()
    expect(stubCallsFor(stub, 'public.content.pages.bySlug')[0]?.input.draft).toBe(false)
  })

  it('forwards `?draft=true` verbatim — kobato owns the viewer rule', async () => {
    const stub = stubWith(makePayload())

    const result = loaderData<Record<string, unknown>>(await loader(args(stub, 'http://localhost/about?draft=true')))
    expect(stubCallsFor(stub, 'public.content.pages.bySlug')[0]?.input.draft).toBe(true)
    expect(result.draftMarker).toBeNull()
  })

  it('404s when kobato rejects the slug (an unpublished page for a non-admin)', async () => {
    const stub = createStubKobato({
      'public.content.pages.bySlug': () => {
        throw new ORPCError('NOT_FOUND', { message: 'missing' })
      },
    })

    await expect(loader(args(stub, 'http://localhost/draft-page'))).rejects.toMatchObject({ status: 404 })
  })

  it('relays 【草稿】 (draft) when kobato marks an unpublished page', async () => {
    const stub = stubWith(makePayload({ draftMarker: 'draft' }))

    const result = loaderData<Record<string, unknown>>(await loader(args(stub, 'http://localhost/about?draft=true')))
    expect(result.draftMarker).toBe('draft')
  })

  it('relays 【未发布的草稿】 (unpublished-draft) when a newer draft exists', async () => {
    const stub = stubWith(makePayload({ draftMarker: 'unpublished-draft' }))

    const result = loaderData<Record<string, unknown>>(await loader(args(stub, 'http://localhost/about?draft=true')))
    expect(result.draftMarker).toBe('unpublished-draft')
  })

  it('relays the on-read projection when the draft revision carries a computed body_html', async () => {
    const stub = stubWith(makePayload({ draftMarker: 'draft', bodyHtml: '<p>computed on read</p>' }))

    const result = loaderData<Record<string, unknown>>(await loader(args(stub, 'http://localhost/about?draft=true')))
    expect(result.bodyHtml).toBe('<p>computed on read</p>')
  })

  it('relays 【已发布的草稿】 (published-draft) when no newer draft exists', async () => {
    const stub = stubWith(makePayload({ draftMarker: 'published-draft' }))

    const result = loaderData<Record<string, unknown>>(await loader(args(stub, 'http://localhost/about?draft=true')))
    expect(result.draftMarker).toBe('published-draft')
  })

  it('never stamps an ETag on a draft preview', async () => {
    const stub = stubWith(makePayload({ draftMarker: 'draft' }), null)

    const result = await loader(args(stub, 'http://localhost/about?draft=true'))
    expect(loaderHeaders(result).ETag).toBeUndefined()
  })
})
