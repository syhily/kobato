import type { ListingPageLoaderData } from '@kobato/catalog/listing'

import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { ORPCError } from '@orpc/contract'
import { loader } from '@sayaka/routes/home'
import {
  createSayakaRequestContext,
  sayakaRequestContext,
  type SayakaRequestContext,
} from '@sayaka/server/request-context'
import { notFound, notModifiedResponse, unwrapListing } from '@sayaka/server/unwrap'
import { RouterContextProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

const LOCALE = 'zh-CN'

describe('unwrapListing', () => {
  it('returns the etag and listing of an ok signal', async () => {
    const listing = { marker: 'listing' }
    const result = await unwrapListing(Promise.resolve({ kind: 'ok', etag: 'W/"abc"', listing }), LOCALE)
    expect(result).toEqual({ etag: 'W/"abc"', listing })
  })

  it('throws the redirect signal as a 301/302 Response', async () => {
    for (const status of [301, 302] as const) {
      const error = await unwrapListing(Promise.resolve({ kind: 'redirect', to: '/', status }), LOCALE).catch(
        (thrown: unknown) => thrown,
      )
      expect(error).toBeInstanceOf(Response)
      const response = unsafeCast<Response>(error)
      expect(response.status).toBe(status)
      expect(response.headers.get('location')).toBe('/')
    }
  })

  it('throws a 304 Response with the representation headers for a not-modified signal', async () => {
    const error = await unwrapListing(Promise.resolve({ kind: 'not-modified', etag: 'W/"abc"' }), LOCALE).catch(
      (thrown: unknown) => thrown,
    )
    expect(error).toBeInstanceOf(Response)
    const response = unsafeCast<Response>(error)
    expect(response.status).toBe(304)
    expect(response.headers.get('etag')).toBe('W/"abc"')
    expect(response.headers.get('content-language')).toBe(LOCALE)
    expect(response.headers.get('cache-control')).toBe('private, no-cache')
    expect(response.headers.get('vary')).toBe('Cookie')
  })

  it('maps an oRPC NOT_FOUND to a thrown 404 Response', async () => {
    const error = await unwrapListing(Promise.reject(new ORPCError('NOT_FOUND', { message: 'missing' })), LOCALE).catch(
      (thrown: unknown) => thrown,
    )
    expect(error).toBeInstanceOf(Response)
    expect(unsafeCast<Response>(error).status).toBe(404)
  })

  it('rethrows other failures untouched', async () => {
    const failure = new Error('boom')
    await expect(unwrapListing(Promise.reject(failure), LOCALE)).rejects.toBe(failure)
  })
})

describe('notFound / notModifiedResponse', () => {
  it('notFound throws a 404 Response', () => {
    try {
      notFound()
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(Response)
      expect(unsafeCast<Response>(error).status).toBe(404)
    }
  })

  it('notModifiedResponse defaults to the detail cache profile', () => {
    const response = notModifiedResponse('W/"x"', 'en-US')
    expect(response.status).toBe(304)
    expect(response.headers.get('cache-control')).toBe('private, no-cache')
  })
})

describe('home loader', () => {
  function makeArgs(home: () => Promise<unknown>) {
    const client = {
      public: {
        content: {
          bootstrap: vi.fn(async () => ({ i18n: { locale: 'zh-CN' } })),
          home: vi.fn(home),
        },
      },
    }
    const ctx = createSayakaRequestContext({
      cspNonce: 'nonce',
      client: unsafeCast<SayakaRequestContext['client']>(client),
      responseHeaders: new Headers(),
      takeResourceStream: () => null,
      analyticsEventId: 'event-id',
    })
    const provider = new RouterContextProvider()
    provider.set(sayakaRequestContext, ctx)
    return {
      ctx,
      args: unsafeCast<Parameters<typeof loader>[0]>({
        request: new Request('http://localhost/page/2'),
        context: provider,
        params: { num: '2' },
      }),
      client,
    }
  }

  it('returns the listing with its etag and the request analytics id', async () => {
    const listing = unsafeCast<ListingPageLoaderData>({ pageNum: 2, listingNowIso: 'now' })
    const { args } = makeArgs(async () => ({ kind: 'ok', etag: 'W/"home"', listing }))
    const result = unsafeCast<{ data: Record<string, unknown>; init: { headers: Record<string, string> } }>(
      await loader(args),
    )
    expect(result.init.headers).toEqual({ ETag: 'W/"home"' })
    expect(result.data).toMatchObject({ pageNum: 2, listingNowIso: 'now', eid: 'event-id' })
  })

  it('passes the page number and the conditional etag to kobato', async () => {
    const listing = unsafeCast<ListingPageLoaderData>({ pageNum: 2 })
    const { args, client } = makeArgs(async () => ({ kind: 'ok', etag: 'W/"home"', listing }))
    const request = new Request('http://localhost/page/2', { headers: { 'if-none-match': 'W/"home"' } })
    await loader(unsafeCast<Parameters<typeof loader>[0]>({ request, context: args.context, params: args.params }))
    expect(client.public.content.home).toHaveBeenCalledWith({ num: '2', ifNoneMatch: 'W/"home"' })
  })
})
