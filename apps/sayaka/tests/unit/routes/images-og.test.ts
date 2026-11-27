import { unsafeCast } from '@kobato/base/utils/unsafe-cast'
import { ORPCError } from '@orpc/contract'
import { loader as ogLoader } from '@sayaka/routes/images-og'
import { loader as ogCategoryLoader } from '@sayaka/routes/images-og-category'
import { createStubKobato, makeSayakaLoaderArgs, stubCallsFor } from '@sayaka/tests/utils/stub-kobato'
import { describe, expect, it } from 'vitest'

const PNG_BODY = 'png-bytes'

type AnyImageLoader = (args: never) => Promise<Response>

function okStub() {
  return createStubKobato({
    'public.images.og': () => ({
      kind: 'ok',
      body: new Blob([PNG_BODY], { type: 'image/png' }),
      contentType: 'image/png',
      cacheControl: 'public, max-age=3600',
      contentLanguage: null,
    }),
  })
}

async function invoke(
  loader: AnyImageLoader,
  path: string,
  params: Record<string, string> = {},
): Promise<{
  stub: ReturnType<typeof okStub>
  response: Response
}> {
  const stub = okStub()
  const { args } = makeSayakaLoaderArgs({ stub, request: new Request(`http://localhost${path}`), params })
  return { stub, response: await loader(unsafeCast<never>(args)) }
}

describe('og image resource routes — the /images/og URLs relay their procedure answer', () => {
  it('answers a 200 PNG with the exact profile the procedure names', async () => {
    const { stub, response } = await invoke(ogLoader as AnyImageLoader, '/images/og/hello-world.png', {
      filename: 'hello-world.png',
    })
    expect(stubCallsFor(stub, 'public.images.og')).toEqual([
      { path: 'public.images.og', input: { slug: 'hello-world', category: undefined } },
    ])
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/png')
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600')
    expect(response.headers.get('Content-Language')).toBeNull()
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('ETag')).toBeNull()
    expect(response.headers.get('Set-Cookie')).toBeNull()
    await expect(response.text()).resolves.toBe(PNG_BODY)
  })

  it('addresses the category scope for /images/og/cats/:slug.png', async () => {
    const { stub, response } = await invoke(ogCategoryLoader as AnyImageLoader, '/images/og/cats/tech.png', {
      filename: 'tech.png',
    })
    expect(stubCallsFor(stub, 'public.images.og')).toEqual([
      { path: 'public.images.og', input: { slug: 'tech', category: true } },
    ])
    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe(PNG_BODY)
  })

  it('answers a 404 for a filename without the .png suffix', async () => {
    const stub = okStub()
    const { args } = makeSayakaLoaderArgs({
      stub,
      request: new Request('http://localhost/images/og/hello'),
      params: { filename: 'hello' },
    })
    await expect(ogLoader(unsafeCast<never>(args))).rejects.toMatchObject({ status: 404 })
    expect(stub.calls).toHaveLength(0)
  })

  it('relays the fallback redirect as a 302 with Location and no cache profile', async () => {
    const stub = createStubKobato({
      'public.images.og': () => ({
        kind: 'redirect',
        location: 'https://example.com/images/open-graph.png',
        cacheControl: null,
      }),
    })
    const { args } = makeSayakaLoaderArgs({
      stub,
      request: new Request('http://localhost/images/og/missing.png'),
      params: { filename: 'missing.png' },
    })
    const response = await ogLoader(unsafeCast<never>(args))
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('https://example.com/images/open-graph.png')
    expect(response.headers.get('Cache-Control')).toBeNull()
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    await expect(response.text()).resolves.toBe('')
  })

  it('relays a redirect cache profile when the procedure names one', async () => {
    const stub = createStubKobato({
      'public.images.og': () => ({
        kind: 'redirect',
        location: 'https://example.com/images/open-graph.png',
        cacheControl: 'public, max-age=300',
      }),
    })
    const { args } = makeSayakaLoaderArgs({
      stub,
      request: new Request('http://localhost/images/og/missing.png'),
      params: { filename: 'missing.png' },
    })
    const response = await ogLoader(unsafeCast<never>(args))
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300')
  })
})

describe('og image resource routes — error translation', () => {
  it('answers 404 when the procedure raises NOT_FOUND', async () => {
    const stub = createStubKobato({
      'public.images.og': () => {
        throw new ORPCError('NOT_FOUND', { message: 'Not Found' })
      },
    })
    const { args } = makeSayakaLoaderArgs({
      stub,
      request: new Request('http://localhost/images/og/x.png'),
      params: { filename: 'x.png' },
    })
    await expect(ogLoader(unsafeCast<never>(args))).rejects.toMatchObject({ status: 404 })
  })
})
