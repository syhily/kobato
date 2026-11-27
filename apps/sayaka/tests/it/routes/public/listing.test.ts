import type { PublicListingLoaderData } from '@kobato/catalog/listing'

import { unsafeCast } from '@kobato/base/utils/unsafe-cast'
import { ORPCError } from '@orpc/contract'
import { loader as categoryLoader } from '@sayaka/routes/category/list'
import { loader as searchLoader } from '@sayaka/routes/search/list'
import { loader as tagLoader } from '@sayaka/routes/tag/list'
import {
  createStubKobato,
  loaderData,
  loaderHeaders,
  makeSayakaLoaderArgs,
  stubCallsFor,
} from '@sayaka/tests/utils/stub-kobato'
import { describe, expect, it } from 'vitest'

const LIST_ETAG = 'W/"fedcba9876543210"'

function makeListing(overrides: Record<string, unknown> = {}) {
  return unsafeCast<PublicListingLoaderData>({
    pageNum: 1,
    totalPage: 1,
    seo: [],
    resolvedPosts: [{ slug: 'post-0', visible: true }],
    rootPath: '/cats/general',
    listingNowIso: '2026-04-25T12:00:00.000Z',
    ...overrides,
  })
}

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
function args<T>(stub: ReturnType<typeof createStubKobato>, request: Request, params: Record<string, string>): T {
  return unsafeCast<T>(makeSayakaLoaderArgs({ stub, request, params }).args)
}

describe('routes/category.list loader — listing revalidation', () => {
  it('answers 304 with the listing headers on a repeat request', async () => {
    const stub = createStubKobato({
      'public.content.posts.list': (input) =>
        input.ifNoneMatch === LIST_ETAG
          ? { kind: 'not-modified', etag: LIST_ETAG }
          : { kind: 'ok', etag: LIST_ETAG, listing: makeListing() },
    })

    const first = await categoryLoader(args(stub, new Request('http://localhost/cats/general'), { slug: 'general' }))
    expect(loaderHeaders(first).ETag).toBe(LIST_ETAG)

    const second = await categoryLoader(
      args(stub, new Request('http://localhost/cats/general', { headers: { 'If-None-Match': LIST_ETAG } }), {
        slug: 'general',
      }),
    ).then(
      () => null,
      (response: unknown) => response,
    )

    expect(second).toBeInstanceOf(Response)
    const response = unsafeCast<Response>(second)
    expect(response.status).toBe(304)
    expect(response.headers.get('ETag')).toBe(LIST_ETAG)
    expect(response.headers.get('Content-Language')).toBe('zh-CN')
    expect(response.headers.get('Cache-Control')).toBe('private, no-cache')
    expect(response.headers.get('Vary')).toBe('Cookie')
  })
})

describe('routes/category.list loader', () => {
  it("404s when the slug doesn't match a known category", async () => {
    const stub = createStubKobato({
      'public.content.posts.list': () => {
        throw new ORPCError('NOT_FOUND', { message: 'missing' })
      },
    })

    await expect(
      categoryLoader(args(stub, new Request('http://localhost/cats/missing'), { slug: 'missing' })),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('returns the canonical payload (title/seo) for a real category', async () => {
    const listing = makeListing({ title: 'general', seo: [{ name: 'robots', content: 'index,follow' }] })
    const stub = createStubKobato({
      'public.content.posts.list': () => ({ kind: 'ok', etag: LIST_ETAG, listing }),
    })

    const result = loaderData<PublicListingLoaderData>(
      await categoryLoader(args(stub, new Request('http://localhost/cats/general'), { slug: 'general' })),
    )
    expect(result.title).toBe('general')
    expect(result.resolvedPosts).toHaveLength(1)
  })

  it('forwards the category scope, page number, and conditional etag to kobato', async () => {
    const stub = createStubKobato({
      'public.content.posts.list': () => ({ kind: 'ok', etag: LIST_ETAG, listing: makeListing() }),
    })

    await categoryLoader(
      args(stub, new Request('http://localhost/cats/general/page/2', { headers: { 'If-None-Match': LIST_ETAG } }), {
        slug: 'general',
        num: '2',
      }),
    )

    const calls = stubCallsFor(stub, 'public.content.posts.list')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.input).toEqual({
      scope: { type: 'category', slug: 'general' },
      num: '2',
      ifNoneMatch: LIST_ETAG,
    })
  })

  it('relays hidden posts untouched for public category visitors', async () => {
    const listing = makeListing({ resolvedPosts: [{ slug: 'hidden-0', visible: false }] })
    const stub = createStubKobato({
      'public.content.posts.list': () => ({ kind: 'ok', etag: LIST_ETAG, listing }),
    })

    const result = loaderData<PublicListingLoaderData>(
      await categoryLoader(args(stub, new Request('http://localhost/cats/general'), { slug: 'general' })),
    )
    expect(result.resolvedPosts[0]?.slug).toBe('hidden-0')
  })

  it('relays hidden posts untouched for admin category visitors', async () => {
    const listing = makeListing({ resolvedPosts: [{ slug: 'hidden-1', visible: false }] })
    const stub = createStubKobato({
      'public.content.posts.list': () => ({ kind: 'ok', etag: LIST_ETAG, listing }),
    })

    const result = loaderData<PublicListingLoaderData>(
      await categoryLoader(args(stub, new Request('http://localhost/cats/general'), { slug: 'general' })),
    )
    expect(result.resolvedPosts[0]?.slug).toBe('hidden-1')
  })
})

describe('routes/tag.list loader', () => {
  it("404s when the slug doesn't match a known tag", async () => {
    const stub = createStubKobato({
      'public.content.posts.list': () => {
        throw new ORPCError('NOT_FOUND', { message: 'missing' })
      },
    })

    await expect(
      tagLoader(args(stub, new Request('http://localhost/tags/missing'), { slug: 'missing' })),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('returns the canonical payload for a real tag', async () => {
    const listing = makeListing({ title: 'typescript', rootPath: '/tags/typescript' })
    const stub = createStubKobato({
      'public.content.posts.list': () => ({ kind: 'ok', etag: LIST_ETAG, listing }),
    })

    const result = loaderData<PublicListingLoaderData>(
      await tagLoader(args(stub, new Request('http://localhost/tags/typescript'), { slug: 'typescript' })),
    )
    expect(result.title).toBe('typescript')
  })

  it('forwards the tag scope to kobato', async () => {
    const stub = createStubKobato({
      'public.content.posts.list': () => ({ kind: 'ok', etag: LIST_ETAG, listing: makeListing() }),
    })

    await tagLoader(args(stub, new Request('http://localhost/tags/typescript'), { slug: 'typescript' }))

    const calls = stubCallsFor(stub, 'public.content.posts.list')
    expect(calls[0]?.input.scope).toEqual({ type: 'tag', slug: 'typescript' })
  })

  it('relays hidden tag posts untouched for public visitors', async () => {
    const listing = makeListing({ resolvedPosts: [{ slug: 'hidden-tag', visible: false }] })
    const stub = createStubKobato({
      'public.content.posts.list': () => ({ kind: 'ok', etag: LIST_ETAG, listing }),
    })

    const result = loaderData<PublicListingLoaderData>(
      await tagLoader(args(stub, new Request('http://localhost/tags/typescript'), { slug: 'typescript' })),
    )
    expect(result.resolvedPosts[0]?.slug).toBe('hidden-tag')
  })
})

describe('routes/search.list loader', () => {
  it('redirects to / when the keyword is empty / whitespace', async () => {
    const stub = createStubKobato({
      'public.content.search': () => ({ kind: 'redirect', to: '/', status: 302 }),
    })

    await expect(
      searchLoader(args(stub, new Request('http://localhost/search/%20'), { keyword: ' ' })),
    ).rejects.toMatchObject({ status: 302 })
  })

  it('returns the search payload with forced noindex SEO for a real query', async () => {
    const listing = makeListing({
      title: 'kobato',
      rootPath: '/search/kobato',
      seo: [{ name: 'robots', content: 'noindex,follow' }],
    })
    const stub = createStubKobato({
      'public.content.search': () => ({ kind: 'ok', etag: LIST_ETAG, listing }),
    })

    const result = loaderData<PublicListingLoaderData>(
      await searchLoader(args(stub, new Request('http://localhost/search/kobato'), { keyword: 'kobato' })),
    )
    expect(result.title).toBe('kobato')
    const robots = result.seo.find((tag) => typeof tag === 'object' && tag !== null && 'name' in tag)
    expect(unsafeCast<{ content: string }>(robots).content).toContain('noindex')
  })

  it('forwards the keyword and page number to kobato', async () => {
    const stub = createStubKobato({
      'public.content.search': () => ({ kind: 'ok', etag: LIST_ETAG, listing: makeListing() }),
    })

    await searchLoader(
      args(stub, new Request('http://localhost/search/kobato/page/2'), { keyword: 'kobato', num: '2' }),
    )

    const calls = stubCallsFor(stub, 'public.content.search')
    expect(calls[0]?.input).toEqual({ keyword: 'kobato', num: '2' })
  })

  it('relays hidden posts untouched in public search results', async () => {
    const listing = makeListing({ resolvedPosts: [{ slug: 'hidden-search', visible: false }] })
    const stub = createStubKobato({
      'public.content.search': () => ({ kind: 'ok', etag: LIST_ETAG, listing }),
    })

    const result = loaderData<PublicListingLoaderData>(
      await searchLoader(args(stub, new Request('http://localhost/search/kobato'), { keyword: 'kobato' })),
    )
    expect(result.resolvedPosts[0]?.slug).toBe('hidden-search')
  })
})
