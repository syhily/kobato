import type { ResourceOk } from '@kobato/api/contracts/primitives'

import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { ORPCError } from '@orpc/contract'
import { loader as categoryFeedLoader } from '@sayaka/routes/category/feed'
import { loader as categoryAtomLoader } from '@sayaka/routes/category/feed-atom'
import { loader as feedLoader } from '@sayaka/routes/feed'
import { loader as atomLoader } from '@sayaka/routes/feed-atom'
import { loader as tagFeedLoader } from '@sayaka/routes/tag/feed'
import { loader as tagAtomLoader } from '@sayaka/routes/tag/feed-atom'
import { createStubKobato, makeSayakaLoaderArgs, stubCallsFor } from '@sayaka/tests/utils/stub-kobato'
import { describe, expect, it } from 'vitest'

const RSS_ETAG = '"f7199d7713764596348fa3f4c5101348"'
const ATOM_ETAG = '"cf226b1e6bffcf2ffa079bd1c1a33b7e"'

type AnyFeedLoader = (args: never) => Promise<Response>

function makeOk(overrides: Partial<ResourceOk> = {}): ResourceOk {
  return {
    kind: 'ok',
    body: '<rss version="2.0"/>',
    etag: RSS_ETAG,
    contentType: 'application/xml; charset=utf-8',
    cacheControl: 'public, no-cache',
    contentLanguage: 'zh-CN',
    ...overrides,
  }
}

function okStub(handler: (input: Record<string, unknown>) => unknown) {
  return createStubKobato({
    'public.feeds.rss': handler,
    'public.feeds.atom': handler,
  })
}

async function invoke(loader: AnyFeedLoader, path: string, params: Record<string, string> = {}, init?: RequestInit) {
  const stub = okStub(() => makeOk())
  const { args } = makeSayakaLoaderArgs({
    stub,
    request: new Request(`http://localhost${path}`, init),
    params,
  })
  return { stub, response: await loader(unsafeCast<never>(args)) }
}

describe('feed resource routes — the six feed URLs relay their procedure answer', () => {
  it.each([
    ['/feed', feedLoader, {}],
    ['/feed/atom', atomLoader, {}],
    ['/cats/tech/feed', categoryFeedLoader, { slug: 'tech' }],
    ['/cats/tech/feed/atom', categoryAtomLoader, { slug: 'tech' }],
    ['/tags/tech/feed', tagFeedLoader, { slug: 'tech' }],
    ['/tags/tech/feed/atom', tagAtomLoader, { slug: 'tech' }],
  ])(
    '%s answers a 200 Response with the procedure body, content type, etag, and cache profile',
    async (path, loader, params) => {
      const { stub, response } = await invoke(loader as AnyFeedLoader, path, params)
      expect(stubCallsFor(stub, 'public.feeds.rss').length + stubCallsFor(stub, 'public.feeds.atom').length).toBe(1)
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('application/xml; charset=utf-8')
      expect(response.headers.get('Cache-Control')).toBe('public, no-cache')
      expect(response.headers.get('ETag')).toBe(RSS_ETAG)
      expect(response.headers.get('Content-Language')).toBe('zh-CN')
      expect(response.headers.get('Set-Cookie')).toBeNull()
      await expect(response.text()).resolves.toBe('<rss version="2.0"/>')
    },
  )

  it('relays the atom representation for /feed/atom', async () => {
    const stub = okStub(() =>
      makeOk({
        body: '<feed xmlns="http://www.w3.org/2005/Atom"/>',
        etag: ATOM_ETAG,
        contentType: 'application/atom+xml; charset=utf-8',
      }),
    )
    const { args } = makeSayakaLoaderArgs({ stub, request: new Request('http://localhost/feed/atom'), params: {} })
    const response = await atomLoader(unsafeCast<never>(args))
    expect(response.headers.get('Content-Type')).toBe('application/atom+xml; charset=utf-8')
    expect(response.headers.get('ETag')).toBe(ATOM_ETAG)
    await expect(response.text()).resolves.toContain('<feed')
  })

  it('omits Content-Language when the procedure names none', async () => {
    const stub = okStub(() => makeOk({ contentLanguage: null }))
    const { args } = makeSayakaLoaderArgs({ stub, request: new Request('http://localhost/feed'), params: {} })
    const response = await feedLoader(unsafeCast<never>(args))
    expect(response.headers.get('Content-Language')).toBeNull()
  })
})

describe('feed resource routes — procedure inputs', () => {
  it('/feed sends only ifNoneMatch', async () => {
    const stub = okStub(() => makeOk())
    const { args } = makeSayakaLoaderArgs({ stub, request: new Request('http://localhost/feed'), params: {} })
    await feedLoader(unsafeCast<never>(args))
    expect(stubCallsFor(stub, 'public.feeds.rss')).toEqual([
      { path: 'public.feeds.rss', input: { ifNoneMatch: undefined } },
    ])
  })

  it('/cats/:slug/feed addresses the category scope', async () => {
    const stub = okStub(() => makeOk())
    const { args } = makeSayakaLoaderArgs({
      stub,
      request: new Request('http://localhost/cats/tech/feed'),
      params: { slug: 'tech' },
    })
    await categoryFeedLoader(unsafeCast<never>(args))
    expect(stubCallsFor(stub, 'public.feeds.rss')).toEqual([
      { path: 'public.feeds.rss', input: { category: 'tech', ifNoneMatch: undefined } },
    ])
  })

  it('/tags/:slug/feed/atom addresses the tag scope on the atom procedure', async () => {
    const stub = okStub(() => makeOk())
    const { args } = makeSayakaLoaderArgs({
      stub,
      request: new Request('http://localhost/tags/ai/feed/atom'),
      params: { slug: 'ai' },
    })
    await tagAtomLoader(unsafeCast<never>(args))
    expect(stubCallsFor(stub, 'public.feeds.atom')).toEqual([
      { path: 'public.feeds.atom', input: { tag: 'ai', ifNoneMatch: undefined } },
    ])
  })

  it('forwards the inbound if-none-match header as procedure input', async () => {
    const stub = okStub(() => makeOk())
    const { args } = makeSayakaLoaderArgs({
      stub,
      request: new Request('http://localhost/feed', { headers: { 'If-None-Match': `W/${RSS_ETAG}` } }),
      params: {},
    })
    await feedLoader(unsafeCast<never>(args))
    expect(stubCallsFor(stub, 'public.feeds.rss')[0]?.input).toEqual({ ifNoneMatch: `W/${RSS_ETAG}` })
  })
})

describe('feed resource routes — conditional and missing scope', () => {
  it('answers a 304 with the etag and the same representation headers', async () => {
    const stub = okStub(() => ({
      kind: 'not-modified',
      etag: RSS_ETAG,
      contentType: 'application/xml; charset=utf-8',
      cacheControl: 'public, no-cache',
      contentLanguage: 'zh-CN',
    }))
    const { args } = makeSayakaLoaderArgs({
      stub,
      request: new Request('http://localhost/feed', { headers: { 'If-None-Match': `W/${RSS_ETAG}` } }),
      params: {},
    })
    const response = await feedLoader(unsafeCast<never>(args))
    expect(response.status).toBe(304)
    expect(response.headers.get('ETag')).toBe(RSS_ETAG)
    expect(response.headers.get('Content-Type')).toBe('application/xml; charset=utf-8')
    expect(response.headers.get('Cache-Control')).toBe('public, no-cache')
    expect(response.headers.get('Content-Language')).toBe('zh-CN')
    expect(response.headers.get('Set-Cookie')).toBeNull()
    await expect(response.text()).resolves.toBe('')
  })

  it('drops Content-Language from the 304 when the procedure names none', async () => {
    const stub = okStub(() => ({
      kind: 'not-modified',
      etag: RSS_ETAG,
      contentType: 'application/xml; charset=utf-8',
      cacheControl: 'public, no-cache',
      contentLanguage: null,
    }))
    const { args } = makeSayakaLoaderArgs({ stub, request: new Request('http://localhost/feed'), params: {} })
    const response = await feedLoader(unsafeCast<never>(args))
    expect(response.status).toBe(304)
    expect(response.headers.get('Content-Language')).toBeNull()
  })

  it('answers 404 when the procedure raises NOT_FOUND for a missing scope', async () => {
    const stub = okStub(() => {
      throw new ORPCError('NOT_FOUND', { message: 'Not Found' })
    })
    const { args } = makeSayakaLoaderArgs({
      stub,
      request: new Request('http://localhost/cats/nope/feed'),
      params: { slug: 'nope' },
    })
    await expect(categoryFeedLoader(unsafeCast<never>(args))).rejects.toMatchObject({
      status: 404,
    })
  })
})
