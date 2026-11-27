// @vitest-environment node
import type { Env } from '@sayaka/server/hono-env'
import type { SayakaRequestContext } from '@sayaka/server/request-context'

import { unsafeCast } from '@kobato/base/utils/unsafe-cast'
import { cookieRelay, isHtmlContentType } from '@sayaka/server/cookie-relay'
import { createSayakaRequestContext } from '@sayaka/server/request-context'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

function makeContext(responseHeaders: Headers): SayakaRequestContext {
  return createSayakaRequestContext({
    cspNonce: 'nonce',
    client: unsafeCast<SayakaRequestContext['client']>({}),
    responseHeaders,
    analyticsEventId: 'event-id',
    takeResourceStream: () => null,
  })
}

function makeApp(responseHeaders: Headers, contentType?: string) {
  const app = new Hono<Env>()
  app.use(async (c, next) => {
    c.set('sayaka', makeContext(responseHeaders))
    await next()
  })
  app.use(cookieRelay)
  app.get('/x', (c) => {
    if (contentType !== undefined) {
      c.header('Content-Type', contentType)
    }
    return c.body('ok')
  })
  return app
}

function relayedResponseHeaders(): Headers {
  const responseHeaders = new Headers()
  responseHeaders.append('set-cookie', '__csrf=one; Path=/')
  responseHeaders.append('set-cookie', 'session=two; Path=/')
  return responseHeaders
}

describe('cookieRelay', () => {
  it('appends every Set-Cookie collected from kobato exactly once on an HTML document', async () => {
    const response = await makeApp(relayedResponseHeaders(), 'text/html; charset=utf-8').request('/x')
    expect(response.headers.getSetCookie()).toEqual(['__csrf=one; Path=/', 'session=two; Path=/'])
  })

  it.each(['text/html', 'text/html; charset=utf-8', 'Text/HTML;Charset=UTF-8', ' text/html ; charset=utf-8 '])(
    'relays onto the %s document',
    async (contentType) => {
      const response = await makeApp(relayedResponseHeaders(), contentType).request('/x')
      expect(response.headers.getSetCookie()).toHaveLength(2)
    },
  )

  it.each([undefined, 'text/plain; charset=utf-8', 'application/xml; charset=utf-8', 'application/json', 'image/png'])(
    'never relays onto a %s response',
    async (contentType) => {
      const response = await makeApp(relayedResponseHeaders(), contentType).request('/x')
      expect(response.headers.getSetCookie()).toEqual([])
    },
  )

  it('adds nothing when kobato set no cookie', async () => {
    const response = await makeApp(new Headers(), 'text/html').request('/x')
    expect(response.headers.getSetCookie()).toEqual([])
  })

  it('relays nothing when the request never reached the router', async () => {
    const app = new Hono<Env>()
    app.use(cookieRelay)
    app.get('/x', (c) => c.text('ok'))
    const response = await app.request('/x')
    expect(response.headers.getSetCookie()).toEqual([])
  })

  describe('isHtmlContentType', () => {
    it('is exactly the text/html predicate with parameters', () => {
      expect(
        isHtmlContentType(new Response('<html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } })),
      ).toBe(true)
      expect(isHtmlContentType(new Response('<html>', { headers: { 'Content-Type': 'text/html' } }))).toBe(true)
      expect(isHtmlContentType(new Response('xml', { headers: { 'Content-Type': 'application/xml' } }))).toBe(false)
      expect(isHtmlContentType(new Response(null, { status: 304 }))).toBe(false)
    })
  })
})
