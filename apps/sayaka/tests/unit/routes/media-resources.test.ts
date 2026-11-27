import { unsafeCast } from '@kobato/base/utils/unsafe-cast'
import { ORPCError } from '@orpc/contract'
import { loader as fontsLoader } from '@sayaka/routes/fonts-embedded'
import { loader as storageLoader } from '@sayaka/routes/storage'
import { createStubKobato, makeSayakaLoaderArgs, stubCallsFor } from '@sayaka/tests/utils/stub-kobato'
import { describe, expect, it } from 'vitest'

const HASH = 'a'.repeat(64)

describe('fonts/storage media resource routes — envelope answers relay', () => {
  it('addresses fonts.embedded with the raw path, validators, and query', async () => {
    const stub = createStubKobato({
      'public.fonts.embedded': () => ({
        kind: 'redirect',
        location: `https://assets.example.com/fonts/${HASH}/result.css?v=1`,
        cacheControl: 'public, max-age=300',
      }),
    })
    const { args } = makeSayakaLoaderArgs({
      stub,
      request: new Request(`http://localhost/fonts/embedded/${HASH}/result.css?v=1`),
      params: {},
    })
    const response = await fontsLoader(unsafeCast<never>(args))
    expect(stubCallsFor(stub, 'public.fonts.embedded')).toEqual([
      {
        path: 'public.fonts.embedded',
        input: {
          path: `/fonts/embedded/${HASH}/result.css`,
          ifNoneMatch: undefined,
          range: undefined,
          search: '?v=1',
        },
      },
    ])
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe(`https://assets.example.com/fonts/${HASH}/result.css?v=1`)
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Accept-Ranges')).toBeNull()
    expect(response.headers.get('Set-Cookie')).toBeNull()
  })

  it('relays a not-modified answer with the media header profile', async () => {
    const stub = createStubKobato({
      'public.storage.object': () => ({
        kind: 'not-modified',
        etag: '"83-1795684055254"',
        contentType: 'image/jpeg',
        cacheControl: 'public, max-age=31536000, immutable, no-transform',
        contentLanguage: null,
      }),
    })
    const { args } = makeSayakaLoaderArgs({
      stub,
      request: new Request('http://localhost/storage/images/a.jpg', {
        headers: { 'If-None-Match': '"83-1795684055254"' },
      }),
      params: {},
    })
    const response = await storageLoader(unsafeCast<never>(args))
    expect(stubCallsFor(stub, 'public.storage.object')).toEqual([
      {
        path: 'public.storage.object',
        input: {
          path: '/storage/images/a.jpg',
          ifNoneMatch: '"83-1795684055254"',
          range: undefined,
          search: '',
        },
      },
    ])
    expect(response.status).toBe(304)
    expect(response.headers.get('ETag')).toBe('"83-1795684055254"')
    expect(response.headers.get('Content-Type')).toBe('image/jpeg')
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable, no-transform')
    expect(response.headers.get('Accept-Ranges')).toBe('bytes')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    await expect(response.text()).resolves.toBe('')
  })

  it('relays range-not-satisfiable as a 416 with Content-Range', async () => {
    const stub = createStubKobato({
      'public.storage.object': () => ({
        kind: 'range-not-satisfiable',
        etag: '"83-1795684055254"',
        contentRange: 'bytes */83',
        contentType: 'image/jpeg',
        cacheControl: 'public, max-age=31536000, immutable, no-transform',
        contentLanguage: null,
      }),
    })
    const { args } = makeSayakaLoaderArgs({
      stub,
      request: new Request('http://localhost/storage/images/a.jpg', { headers: { Range: 'bytes=999-' } }),
      params: {},
    })
    const response = await storageLoader(unsafeCast<never>(args))
    expect(response.status).toBe(416)
    expect(response.headers.get('Content-Range')).toBe('bytes */83')
    expect(response.headers.get('Accept-Ranges')).toBe('bytes')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    await expect(response.text()).resolves.toBe('')
  })

  it('forwards the inbound Range header as procedure input', async () => {
    const stub = createStubKobato({
      'public.fonts.embedded': () => ({
        kind: 'not-modified',
        etag: '"11-100"',
        contentType: 'font/woff2',
        cacheControl: 'public, max-age=31536000, immutable, no-transform',
        contentLanguage: null,
      }),
    })
    const { args } = makeSayakaLoaderArgs({
      stub,
      request: new Request(`http://localhost/fonts/embedded/${HASH}/chunk.woff2`, { headers: { Range: 'bytes=0-4' } }),
      params: {},
    })
    await fontsLoader(unsafeCast<never>(args))
    expect(stubCallsFor(stub, 'public.fonts.embedded')[0]?.input).toMatchObject({ range: 'bytes=0-4' })
  })
})

describe('fonts/storage media resource routes — error translation', () => {
  it.each([
    ['/fonts/embedded/abc123/x', fontsLoader, 'public.fonts.embedded'],
    ['/storage/private/secret.txt', storageLoader, 'public.storage.object'],
  ] as const)('answers %s with a 400 when the procedure rejects the key grammar', async (path, loader, procedure) => {
    const stub = createStubKobato({
      [procedure]: () => {
        throw new ORPCError('BAD_REQUEST', { message: 'Invalid request parameters.' })
      },
    })
    const { args } = makeSayakaLoaderArgs({ stub, request: new Request(`http://localhost${path}`), params: {} })
    const response = await loader(unsafeCast<never>(args)).then(
      (value) => value,
      (error: unknown) => unsafeCast<Response>(error),
    )
    expect(response.status).toBe(400)
    await expect(response.text()).resolves.toBe('')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })

  it('answers 404 when the procedure raises NOT_FOUND', async () => {
    const stub = createStubKobato({
      'public.storage.object': () => {
        throw new ORPCError('NOT_FOUND', { message: 'Not Found' })
      },
    })
    const { args } = makeSayakaLoaderArgs({
      stub,
      request: new Request('http://localhost/storage/backup/dump.gz'),
      params: {},
    })
    const response = await storageLoader(unsafeCast<never>(args)).then(
      (value) => value,
      (error: unknown) => unsafeCast<Response>(error),
    )
    expect(response.status).toBe(404)
    expect(response.headers.get('Set-Cookie')).toBeNull()
    await expect(response.text()).resolves.toBe('Not Found')
  })

  it('answers 429 with the localized message when the avatar/image limiter trips', async () => {
    const stub = createStubKobato({
      'public.avatar.image': () => {
        throw new ORPCError('TOO_MANY_REQUESTS', { message: '请求过于频繁，请稍后再试。' })
      },
    })
    const { args } = makeSayakaLoaderArgs({
      stub,
      request: new Request('http://localhost/images/avatar/abc.png'),
      params: { filename: 'abc.png' },
    })
    const loader = (await import('@sayaka/routes/images-avatar')).loader
    const response = await loader(unsafeCast<never>(args)).then(
      (value) => value,
      (error: unknown) => unsafeCast<Response>(error),
    )
    expect(response.status).toBe(429)
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8')
    await expect(response.text()).resolves.toBe('请求过于频繁，请稍后再试。')
  })
})
