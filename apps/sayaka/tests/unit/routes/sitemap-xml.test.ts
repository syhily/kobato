import { unsafeCast } from '@kobato/base/utils/unsafe-cast'
import { ORPCError } from '@orpc/contract'
import { loader as sitemapLoader } from '@sayaka/routes/sitemap-xml'
import { createStubKobato, makeSayakaLoaderArgs, stubCallsFor } from '@sayaka/tests/utils/stub-kobato'
import { describe, expect, it } from 'vitest'

const SITEMAP_ETAG = '"7dab91e0a3c91f5f2347a999668b9cab"'
const SITEMAP_BODY =
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>'

type SitemapLoader = typeof sitemapLoader

function sitemapStub(handler: (input: Record<string, unknown>) => unknown) {
  return createStubKobato({ 'public.sitemap.xml': handler })
}

describe('sitemap.xml resource route', () => {
  it('relays the procedure answer as a 200 Response without a Content-Language header', async () => {
    const stub = sitemapStub(() => ({
      kind: 'ok',
      body: SITEMAP_BODY,
      etag: SITEMAP_ETAG,
      contentType: 'application/xml; charset=utf-8',
      cacheControl: 'public, no-cache',
      contentLanguage: null,
    }))
    const { args } = makeSayakaLoaderArgs({ stub, request: new Request('http://localhost/sitemap.xml'), params: {} })
    const response = await sitemapLoader(unsafeCast<Parameters<SitemapLoader>[0]>(args))
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/xml; charset=utf-8')
    expect(response.headers.get('Cache-Control')).toBe('public, no-cache')
    expect(response.headers.get('ETag')).toBe(SITEMAP_ETAG)
    expect(response.headers.get('Content-Language')).toBeNull()
    expect(response.headers.get('Set-Cookie')).toBeNull()
    await expect(response.text()).resolves.toBe(SITEMAP_BODY)
    expect(stubCallsFor(stub, 'public.sitemap.xml')).toEqual([
      { path: 'public.sitemap.xml', input: { ifNoneMatch: undefined } },
    ])
  })

  it('forwards the inbound if-none-match and answers a 304 with the etag', async () => {
    const stub = sitemapStub(() => ({
      kind: 'not-modified',
      etag: SITEMAP_ETAG,
      contentType: 'application/xml; charset=utf-8',
      cacheControl: 'public, no-cache',
      contentLanguage: null,
    }))
    const { args } = makeSayakaLoaderArgs({
      stub,
      request: new Request('http://localhost/sitemap.xml', { headers: { 'If-None-Match': SITEMAP_ETAG } }),
      params: {},
    })
    const response = await sitemapLoader(unsafeCast<Parameters<SitemapLoader>[0]>(args))
    expect(response.status).toBe(304)
    expect(response.headers.get('ETag')).toBe(SITEMAP_ETAG)
    expect(response.headers.get('Set-Cookie')).toBeNull()
    expect(stubCallsFor(stub, 'public.sitemap.xml')[0]?.input).toEqual({ ifNoneMatch: SITEMAP_ETAG })
    await expect(response.text()).resolves.toBe('')
  })

  it('answers 404 when the procedure raises NOT_FOUND', async () => {
    const stub = sitemapStub(() => {
      throw new ORPCError('NOT_FOUND', { message: 'Not Found' })
    })
    const { args } = makeSayakaLoaderArgs({ stub, request: new Request('http://localhost/sitemap.xml'), params: {} })
    await expect(sitemapLoader(unsafeCast<Parameters<SitemapLoader>[0]>(args))).rejects.toMatchObject({ status: 404 })
  })
})
