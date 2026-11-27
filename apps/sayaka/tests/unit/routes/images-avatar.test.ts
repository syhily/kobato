import { unsafeCast } from '@kobato/base/utils/unsafe-cast'
import { ORPCError } from '@orpc/contract'
import { loader as avatarLoader } from '@sayaka/routes/images-avatar'
import { createStubKobato, makeSayakaLoaderArgs, stubCallsFor } from '@sayaka/tests/utils/stub-kobato'
import { describe, expect, it } from 'vitest'

describe('avatar image resource route', () => {
  it('relays the ok envelope with the weekly cache profile and no Content-Language', async () => {
    const stub = createStubKobato({
      'public.avatar.image': () => ({
        kind: 'ok',
        body: new Blob(['av'], { type: 'image/png' }),
        contentType: 'image/png',
        cacheControl: 'public, max-age=604800',
        contentLanguage: null,
      }),
    })
    const { args } = makeSayakaLoaderArgs({
      stub,
      request: new Request('http://localhost/images/avatar/abcdef0123456789.png?s=256'),
      params: { filename: 'abcdef0123456789.png' },
    })
    const response = await avatarLoader(unsafeCast<never>(args))
    expect(stubCallsFor(stub, 'public.avatar.image')).toEqual([
      { path: 'public.avatar.image', input: { hash: 'abcdef0123456789', size: '256' } },
    ])
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/png')
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=604800')
    expect(response.headers.get('Content-Language')).toBeNull()
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Set-Cookie')).toBeNull()
    await expect(response.text()).resolves.toBe('av')
  })

  it('omits the size input when the request has no ?s=', async () => {
    const stub = createStubKobato({
      'public.avatar.image': () => ({
        kind: 'redirect',
        location: '/images/default-avatar.png',
        cacheControl: null,
      }),
    })
    const { args } = makeSayakaLoaderArgs({
      stub,
      request: new Request('http://localhost/images/avatar/abcdef0123456789.png'),
      params: { filename: 'abcdef0123456789.png' },
    })
    const response = await avatarLoader(unsafeCast<never>(args))
    expect(stubCallsFor(stub, 'public.avatar.image')).toEqual([
      { path: 'public.avatar.image', input: { hash: 'abcdef0123456789', size: undefined } },
    ])
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/images/default-avatar.png')
    expect(response.headers.get('Cache-Control')).toBeNull()
  })

  it('answers 404 for a non-png filename and for a procedure NOT_FOUND', async () => {
    const stub = createStubKobato({
      'public.avatar.image': () => {
        throw new ORPCError('NOT_FOUND', { message: 'Not Found' })
      },
    })
    const { args } = makeSayakaLoaderArgs({
      stub,
      request: new Request('http://localhost/images/avatar/42.jpg'),
      params: { filename: '42.jpg' },
    })
    await expect(avatarLoader(unsafeCast<never>(args))).rejects.toMatchObject({ status: 404 })
    expect(stub.calls).toHaveLength(0)
  })
})
