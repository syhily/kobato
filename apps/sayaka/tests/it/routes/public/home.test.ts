import type { HomeExtra } from '@kobato/api/contracts/public/content'
import type { PublicListingLoaderData } from '@kobato/catalog/listing'

import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { loader } from '@sayaka/routes/home'
import {
  createStubKobato,
  loaderData,
  loaderHeaders,
  makeSayakaLoaderArgs,
  STUB_ANALYTICS_EVENT_ID,
} from '@sayaka/tests/utils/stub-kobato'
import { describe, expect, it } from 'vitest'

const HOME_ETAG = 'W/"0123456789abcdef"'

function makeListing(pageNum: number, overrides: Record<string, unknown> = {}) {
  return unsafeCast<PublicListingLoaderData<HomeExtra>>({
    pageNum,
    totalPage: 2,
    seo: [],
    resolvedPosts: [{ slug: `post-${pageNum}` }],
    rootPath: '/',
    listingNowIso: '2026-04-25T12:00:00.000Z',
    extra: {
      categoryLinks: { general: '/cats/general' },
      featurePosts: [],
      sidebar: { posts: [], tags: [], recentComments: [] },
    },
    ...overrides,
  })
}

function homeStub(handlers: Parameters<typeof createStubKobato>[0]) {
  return createStubKobato(handlers)
}

describe('routes/home loader — listing revalidation', () => {
  it('stamps the listing ETag and answers a 304 on a repeat request', async () => {
    const stub = homeStub({
      'public.content.home': (input) =>
        input.ifNoneMatch === HOME_ETAG
          ? { kind: 'not-modified', etag: HOME_ETAG }
          : { kind: 'ok', etag: HOME_ETAG, listing: makeListing(1) },
    })

    const first = await loader(
      unsafeCast<Parameters<typeof loader>[0]>(
        makeSayakaLoaderArgs({ stub, request: new Request('http://localhost/'), params: {} }).args,
      ),
    )
    expect(loaderHeaders(first).ETag).toBe(HOME_ETAG)

    const second = await loader(
      unsafeCast<Parameters<typeof loader>[0]>(
        makeSayakaLoaderArgs({
          stub,
          request: new Request('http://localhost/', { headers: { 'If-None-Match': HOME_ETAG } }),
          params: {},
        }).args,
      ),
    ).then(
      () => null,
      (response: unknown) => response,
    )

    expect(second).toBeInstanceOf(Response)
    const response = unsafeCast<Response>(second)
    expect(response.status).toBe(304)
    expect(response.headers.get('ETag')).toBe(HOME_ETAG)
    expect(response.headers.get('Content-Language')).toBe('zh-CN')
    expect(response.headers.get('Cache-Control')).toBe('private, no-cache')
    expect(response.headers.get('Vary')).toBe('Cookie')
  })

  it('keeps a 200 and a fresh tag after the catalogue changes', async () => {
    let etag = 'W/"aaaaaaaaaaaaaaaa"'
    const stub = homeStub({
      'public.content.home': () => ({ kind: 'ok', etag, listing: makeListing(1) }),
    })

    const first = await loader(
      unsafeCast<Parameters<typeof loader>[0]>(
        makeSayakaLoaderArgs({ stub, request: new Request('http://localhost/'), params: {} }).args,
      ),
    )

    etag = 'W/"bbbbbbbbbbbbbbbb"'
    const second = await loader(
      unsafeCast<Parameters<typeof loader>[0]>(
        makeSayakaLoaderArgs({
          stub,
          request: new Request('http://localhost/', { headers: { 'If-None-Match': loaderHeaders(first).ETag! } }),
          params: {},
        }).args,
      ),
    )
    expect(loaderHeaders(second).ETag).toBe('W/"bbbbbbbbbbbbbbbb"')
    expect(loaderHeaders(second).ETag).not.toBe(loaderHeaders(first).ETag)
  })
})

describe('routes/home loader', () => {
  it('/page/1 collapses to / (canonical) via 30x redirect', async () => {
    const stub = homeStub({
      'public.content.home': (input) =>
        input.num === '1'
          ? { kind: 'redirect', to: '/', status: 302 }
          : { kind: 'ok', etag: HOME_ETAG, listing: makeListing(2) },
    })

    await expect(
      loader(
        unsafeCast<Parameters<typeof loader>[0]>(
          makeSayakaLoaderArgs({ stub, request: new Request('http://localhost/page/1'), params: { num: '1' } }).args,
        ),
      ),
    ).rejects.toMatchObject({ status: 302 })
  })

  it('returns the unified listing payload (resolvedPosts, extra.sidebar, empty seo) on /', async () => {
    const listing = makeListing(1, { resolvedPosts: [{ slug: 'post-9' }] })
    const stub = homeStub({
      'public.content.home': () => ({ kind: 'ok', etag: HOME_ETAG, listing }),
    })

    const result = loaderData<PublicListingLoaderData<HomeExtra>>(
      await loader(
        unsafeCast<Parameters<typeof loader>[0]>(
          makeSayakaLoaderArgs({ stub, request: new Request('http://localhost/'), params: {} }).args,
        ),
      ),
    )

    expect(result.pageNum).toBe(1)
    expect(result.seo).toEqual([])
    expect(result.resolvedPosts[0]?.slug).toBe('post-9')
    expect(result.extra.categoryLinks.general).toBe('/cats/general')
    expect(result.extra.sidebar.recentComments).toEqual([])
    expect(result.eid).toBe(STUB_ANALYTICS_EVENT_ID)
  })

  it('returns the deep-paginated payload (with seo populated) on /page/N', async () => {
    const listing = makeListing(2, {
      seo: [
        { tagName: 'link', rel: 'canonical', href: 'https://example.com/page/2' },
        { name: 'robots', content: 'noindex,follow' },
      ],
    })
    const stub = homeStub({
      'public.content.home': () => ({ kind: 'ok', etag: HOME_ETAG, listing }),
    })

    const result = loaderData<PublicListingLoaderData<HomeExtra>>(
      await loader(
        unsafeCast<Parameters<typeof loader>[0]>(
          makeSayakaLoaderArgs({ stub, request: new Request('http://localhost/page/2'), params: { num: '2' } }).args,
        ),
      ),
    )

    expect(result.pageNum).toBe(2)
    const canonical = result.seo.find(
      (tag) => typeof tag === 'object' && tag !== null && 'tagName' in tag && tag.tagName === 'link',
    )
    expect(unsafeCast<{ href: string }>(canonical).href).toContain('/page/2')
    const robots = result.seo.find((tag) => typeof tag === 'object' && tag !== null && 'name' in tag)
    expect(unsafeCast<{ content: string }>(robots).content).toContain('noindex')
  })

  it('redirects /page/N to the last valid page when N overflows', async () => {
    const stub = homeStub({
      'public.content.home': () => ({ kind: 'redirect', to: '/page/2', status: 302 }),
    })

    await expect(
      loader(
        unsafeCast<Parameters<typeof loader>[0]>(
          makeSayakaLoaderArgs({ stub, request: new Request('http://localhost/page/9999'), params: { num: '9999' } })
            .args,
        ),
      ),
    ).rejects.toMatchObject({ status: 302 })
  })

  it('passes the page number and the conditional etag to kobato', async () => {
    const stub = homeStub({
      'public.content.home': () => ({ kind: 'ok', etag: HOME_ETAG, listing: makeListing(2) }),
    })

    await loader(
      unsafeCast<Parameters<typeof loader>[0]>(
        makeSayakaLoaderArgs({
          stub,
          request: new Request('http://localhost/page/2', { headers: { 'If-None-Match': HOME_ETAG } }),
          params: { num: '2' },
        }).args,
      ),
    )

    const calls = stub.calls.filter((call) => call.path === 'public.content.home')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.input).toEqual({ num: '2', ifNoneMatch: HOME_ETAG })
  })
})

describe('routes/home loader — tail-merge guard', () => {
  it('absorbs a 1-post tail into the previous page so /page/2 redirects to /', async () => {
    const stub = homeStub({
      'public.content.home': (input) =>
        input.num === '2'
          ? { kind: 'redirect', to: '/', status: 302 }
          : { kind: 'ok', etag: HOME_ETAG, listing: makeListing(1) },
    })

    await expect(
      loader(
        unsafeCast<Parameters<typeof loader>[0]>(
          makeSayakaLoaderArgs({ stub, request: new Request('http://localhost/page/2'), params: { num: '2' } }).args,
        ),
      ),
    ).rejects.toMatchObject({ status: 302 })
  })

  it('returns all posts on / when the merge collapses the full catalogue into one page', async () => {
    const listing = makeListing(1, {
      totalPage: 1,
      resolvedPosts: Array.from({ length: 7 }, (_, i) => ({ slug: `short-${i}` })),
    })
    const stub = homeStub({
      'public.content.home': () => ({ kind: 'ok', etag: HOME_ETAG, listing }),
    })

    const result = loaderData<PublicListingLoaderData<HomeExtra>>(
      await loader(
        unsafeCast<Parameters<typeof loader>[0]>(
          makeSayakaLoaderArgs({ stub, request: new Request('http://localhost/'), params: {} }).args,
        ),
      ),
    )

    expect(result.totalPage).toBe(1)
    expect(result.pageNum).toBe(1)
    expect(result.resolvedPosts).toHaveLength(7)
  })
})
