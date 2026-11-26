import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { loader } from '@sayaka/routes/archives'
import { createStubKobato, loaderData, loaderHeaders, makeSayakaLoaderArgs } from '@sayaka/tests/utils/stub-kobato'
import { describe, expect, it } from 'vitest'

const ARCHIVES_ETAG = 'W/"aaaabbbbccccdddd"'

interface ArchivesPayload {
  resolvedPosts: Array<Record<string, unknown>>
  listingNowIso: string
}

function makePayload(): ArchivesPayload {
  return {
    resolvedPosts: [
      { slug: 'visible-post', visible: true, scheduled: false },
      { slug: 'hidden-post', visible: false, scheduled: false },
    ],
    listingNowIso: '2026-04-25T12:00:00.000Z',
  }
}

function args(stub: ReturnType<typeof createStubKobato>, request: Request): Parameters<typeof loader>[0] {
  return unsafeCast<Parameters<typeof loader>[0]>(makeSayakaLoaderArgs({ stub, request, params: {} }).args)
}

describe('routes/archives loader — listing revalidation', () => {
  it('stamps the listing ETag and answers a 304 on a repeat request', async () => {
    const stub = createStubKobato({
      'public.content.archives': (input) =>
        input.ifNoneMatch === ARCHIVES_ETAG
          ? { kind: 'not-modified', etag: ARCHIVES_ETAG }
          : { kind: 'ok', etag: ARCHIVES_ETAG, payload: makePayload() },
    })

    const first = await loader(args(stub, new Request('http://localhost/archives')))
    expect(loaderHeaders(first).ETag).toBe(ARCHIVES_ETAG)

    const second = await loader(
      args(stub, new Request('http://localhost/archives', { headers: { 'If-None-Match': ARCHIVES_ETAG } })),
    ).then(
      () => null,
      (response: unknown) => response,
    )

    expect(second).toBeInstanceOf(Response)
    const response = unsafeCast<Response>(second)
    expect(response.status).toBe(304)
    expect(response.headers.get('ETag')).toBe(ARCHIVES_ETAG)
    expect(response.headers.get('Content-Language')).toBe('zh-CN')
    expect(response.headers.get('Cache-Control')).toBe('private, no-cache')
    expect(response.headers.get('Vary')).toBe('Cookie')
  })
})

describe('routes/archives loader', () => {
  it('relays the archives payload untouched (visible=false posts included)', async () => {
    const stub = createStubKobato({
      'public.content.archives': () => ({ kind: 'ok', etag: ARCHIVES_ETAG, payload: makePayload() }),
    })

    const result = loaderData<ArchivesPayload & { eid: string }>(
      await loader(args(stub, new Request('http://localhost/archives'))),
    )
    expect(result.resolvedPosts.map((post) => post.slug)).toEqual(['visible-post', 'hidden-post'])
    expect(result.listingNowIso).toBe('2026-04-25T12:00:00.000Z')
    expect(result.eid).toMatch(/^[0-9a-f-]{36}$/)
  })
})
