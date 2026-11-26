import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { loader as lightLoader } from '@sayaka/routes/images-calendar'
import { loader as darkLoader } from '@sayaka/routes/images-calendar-dark'
import { createStubKobato, makeSayakaLoaderArgs, stubCallsFor } from '@sayaka/tests/utils/stub-kobato'
import { describe, expect, it } from 'vitest'

const PNG = new Blob(['cal-png'], { type: 'image/png' })

function stubWith(handler: (input: Record<string, unknown>) => unknown) {
  return createStubKobato({ 'public.images.calendar': handler })
}

describe('calendar image resource routes — theme from the dark/ path segment', () => {
  it('relays the ok envelope with Content-Language, ETag and the no-cache profile', async () => {
    const stub = stubWith(() => ({
      kind: 'ok',
      body: PNG,
      etag: '"ab554873464b79043dc5fa009ad77f8b"',
      contentType: 'image/png',
      cacheControl: 'public, no-cache',
      contentLanguage: 'zh-CN',
    }))
    const { args } = makeSayakaLoaderArgs({
      stub,
      request: new Request('http://localhost/images/calendar/2026/0617.png'),
      params: { year: '2026', filename: '0617.png' },
    })
    const response = await lightLoader(unsafeCast<never>(args))
    expect(stubCallsFor(stub, 'public.images.calendar')).toEqual([
      { path: 'public.images.calendar', input: { year: '2026', time: '0617', theme: 'light', ifNoneMatch: undefined } },
    ])
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/png')
    expect(response.headers.get('Cache-Control')).toBe('public, no-cache')
    expect(response.headers.get('Content-Language')).toBe('zh-CN')
    expect(response.headers.get('ETag')).toBe('"ab554873464b79043dc5fa009ad77f8b"')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Set-Cookie')).toBeNull()
    await expect(response.text()).resolves.toBe('cal-png')
  })

  it('addresses the dark theme on the dark route', async () => {
    const stub = stubWith(() => ({
      kind: 'ok',
      body: PNG,
      etag: '"3222f974e8c5d32776c3a7e56d9342ef"',
      contentType: 'image/png',
      cacheControl: 'public, no-cache',
      contentLanguage: 'zh-CN',
    }))
    const { args } = makeSayakaLoaderArgs({
      stub,
      request: new Request('http://localhost/images/calendar/dark/2026/0617.png'),
      params: { year: '2026', filename: '0617.png' },
    })
    const response = await darkLoader(unsafeCast<never>(args))
    expect(stubCallsFor(stub, 'public.images.calendar')).toEqual([
      { path: 'public.images.calendar', input: { year: '2026', time: '0617', theme: 'dark', ifNoneMatch: undefined } },
    ])
    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('cal-png')
  })

  it('forwards the inbound if-none-match and answers a 304 with the same header profile', async () => {
    const etag = '"ab554873464b79043dc5fa009ad77f8b"'
    const stub = stubWith(() => ({
      kind: 'not-modified',
      etag,
      contentType: 'image/png',
      cacheControl: 'public, no-cache',
      contentLanguage: 'zh-CN',
    }))
    const { args } = makeSayakaLoaderArgs({
      stub,
      request: new Request('http://localhost/images/calendar/2026/0617.png', {
        headers: { 'If-None-Match': `W/${etag}` },
      }),
      params: { year: '2026', filename: '0617.png' },
    })
    const response = await lightLoader(unsafeCast<never>(args))
    expect(stubCallsFor(stub, 'public.images.calendar')[0]?.input).toMatchObject({ ifNoneMatch: `W/${etag}` })
    expect(response.status).toBe(304)
    expect(response.headers.get('ETag')).toBe(etag)
    expect(response.headers.get('Content-Type')).toBe('image/png')
    expect(response.headers.get('Cache-Control')).toBe('public, no-cache')
    expect(response.headers.get('Content-Language')).toBe('zh-CN')
    expect(response.headers.get('Set-Cookie')).toBeNull()
    await expect(response.text()).resolves.toBe('')
  })

  it('answers 404 for a malformed filename or a procedure NOT_FOUND', async () => {
    const { ORPCError } = await import('@orpc/contract')
    const stub = stubWith(() => {
      throw new ORPCError('NOT_FOUND', { message: 'Not Found' })
    })
    const { args } = makeSayakaLoaderArgs({
      stub,
      request: new Request('http://localhost/images/calendar/2026/1332.png'),
      params: { year: '2026', filename: '1332.png' },
    })
    await expect(lightLoader(unsafeCast<never>(args))).rejects.toMatchObject({ status: 404 })

    const noPng = makeSayakaLoaderArgs({
      stub: stubWith(() => ({})),
      request: new Request('http://localhost/images/calendar/2026/0617'),
      params: { year: '2026', filename: '0617' },
    })
    await expect(lightLoader(unsafeCast<never>(noPng.args))).rejects.toMatchObject({ status: 404 })
  })
})
