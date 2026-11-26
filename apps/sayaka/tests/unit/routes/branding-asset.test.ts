import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { ORPCError } from '@orpc/contract'
import { loader as brandingLoader } from '@sayaka/routes/branding-asset'
import { createStubKobato, makeSayakaLoaderArgs, stubCallsFor } from '@sayaka/tests/utils/stub-kobato'
import { describe, expect, it } from 'vitest'

type BrandingLoader = typeof brandingLoader

const SVG = '<svg>favicon</svg>'

function brandingStub(handler: (input: Record<string, unknown>) => unknown) {
  return createStubKobato({ 'public.branding.asset': handler })
}

async function invoke(
  path: string,
  handler: (input: Record<string, unknown>) => unknown,
  init?: RequestInit,
): Promise<{ stub: ReturnType<typeof brandingStub>; response: Response }> {
  const stub = brandingStub(handler)
  const { args } = makeSayakaLoaderArgs({ stub, request: new Request(`http://localhost${path}`, init), params: {} })
  return { stub, response: await brandingLoader(unsafeCast<Parameters<BrandingLoader>[0]>(args)) }
}

describe('branding asset resource route', () => {
  it('addresses the procedure with the request pathname, the original flag, and if-none-match', async () => {
    const { stub, response } = await invoke('/favicon.svg', () => ({
      kind: 'ok',
      body: new Blob([SVG], { type: 'image/svg+xml' }),
      etag: '"e766"',
      contentType: 'image/svg+xml',
      cacheControl: 'public, max-age=3600, must-revalidate',
      contentLanguage: null,
    }))
    expect(stubCallsFor(stub, 'public.branding.asset')).toEqual([
      {
        path: 'public.branding.asset',
        input: { path: '/favicon.svg', original: false, ifNoneMatch: undefined },
      },
    ])
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml')
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600, must-revalidate')
    expect(response.headers.get('ETag')).toBe('"e766"')
    expect(response.headers.get('Content-Language')).toBeNull()
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Set-Cookie')).toBeNull()
    await expect(response.text()).resolves.toBe(SVG)
  })

  it('flags ?original and forwards inbound if-none-match', async () => {
    const { stub } = await invoke(
      '/logo.svg?original',
      () => ({
        kind: 'ok',
        body: new Blob([SVG], { type: 'image/svg+xml' }),
        etag: '"raw"',
        contentType: 'image/svg+xml',
        cacheControl: 'public, max-age=3600, must-revalidate',
        contentLanguage: null,
      }),
      { headers: { 'If-None-Match': '"stale"' } },
    )
    expect(stubCallsFor(stub, 'public.branding.asset')).toEqual([
      { path: 'public.branding.asset', input: { path: '/logo.svg', original: true, ifNoneMatch: '"stale"' } },
    ])
  })

  it('answers a 304 with the quoted etag and the revalidation profile', async () => {
    const { response } = await invoke('/favicon.svg', () => ({
      kind: 'not-modified',
      etag: '"e766"',
      contentType: 'image/svg+xml',
      cacheControl: 'public, max-age=3600, must-revalidate',
      contentLanguage: null,
    }))
    expect(response.status).toBe(304)
    expect(response.headers.get('ETag')).toBe('"e766"')
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600, must-revalidate')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    await expect(response.text()).resolves.toBe('')
  })

  it('answers 404 when the procedure raises NOT_FOUND for an unregistered path', async () => {
    const outcome = await invoke('/images/unknown.png', () => {
      throw new ORPCError('NOT_FOUND', { message: 'Not Found' })
    }).then(
      ({ response }) => response,
      (error: unknown) => unsafeCast<Response>(error),
    )
    expect(outcome.status).toBe(404)
    await expect(outcome.text()).resolves.toBe('Not Found')
  })
})
