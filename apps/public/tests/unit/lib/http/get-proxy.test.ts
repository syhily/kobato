import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createGetProxy } from '@/lib/http/get-proxy'

// The phase-2 streaming GET/HEAD proxy: frontend URL endpoint → core.
// These tests stub the upstream `fetch` and pin the wire contract — the
// header allowlist, the verbatim relay, and the failure semantics. (The
// real-core round trip lives in the it suite: `url-proxy-parity.test.ts`.)

function makeApp(options?: Parameters<typeof createGetProxy>[0]) {
  const app = new Hono()
  app.use('/feed', createGetProxy(options ?? { coreApiUrl: 'http://core:4321' }))
  return app
}

function stubUpstream(handler: (request: Request) => Response | Promise<Response>) {
  const upstream = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    return handler(new Request(input, init))
  })
  vi.stubGlobal('fetch', upstream)
  return upstream
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createGetProxy', () => {
  it('forwards GET with the allowlisted headers only (no cookie, no Authorization)', async () => {
    let seen: Request | null = null
    const upstream = stubUpstream(async (request) => {
      seen = request
      return new Response('<feed/>', { status: 200, headers: { 'Content-Type': 'application/xml' } })
    })
    const app = makeApp()

    const res = await app.request('/feed?page=2', {
      headers: {
        Accept: 'application/xml',
        'If-None-Match': '"abc"',
        Range: 'bytes=0-99',
        'User-Agent': 'it-browser',
        'Accept-Encoding': 'gzip',
        Cookie: '__comment_tokens=secret',
        Authorization: 'Bearer visitor-jwt',
        'X-Forwarded-For': '203.0.113.9',
      },
    })

    expect(upstream).toHaveBeenCalledTimes(1)
    expect(seen).not.toBeNull()
    expect(seen!.url).toBe('http://core:4321/feed?page=2')
    expect(seen!.method).toBe('GET')
    expect(seen!.headers.get('accept')).toBe('application/xml')
    expect(seen!.headers.get('if-none-match')).toBe('"abc"')
    expect(seen!.headers.get('range')).toBe('bytes=0-99')
    expect(seen!.headers.get('user-agent')).toBe('it-browser')
    expect(seen!.headers.get('accept-encoding')).toBe('gzip')
    // The strict allowlist: first-party cookies and credentials never
    // cross the boundary, and the browser-supplied X-Forwarded-For is
    // never relayed as-is (the core honours only proxy-derived ones).
    expect(seen!.headers.has('cookie')).toBe(false)
    expect(seen!.headers.has('authorization')).toBe(false)
    expect(seen!.headers.has('x-forwarded-for')).toBe(false)

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('<feed/>')
    expect(res.headers.get('content-type')).toBe('application/xml')
  })

  it('passes if-none-match through and relays a 304 verbatim', async () => {
    const upstream = stubUpstream(async (request) => {
      expect(request.headers.get('if-none-match')).toBe('"etag-1"')
      return new Response(null, { status: 304, headers: { ETag: '"etag-1"', 'Cache-Control': 'public, max-age=3600' } })
    })
    const app = makeApp()

    const res = await app.request('/feed', { headers: { 'If-None-Match': '"etag-1"' } })

    expect(upstream).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(304)
    expect(res.headers.get('etag')).toBe('"etag-1"')
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600')
    expect(await res.text()).toBe('')
  })

  it('passes range through and relays a 206 with the media headers', async () => {
    stubUpstream(async (request) => {
      expect(request.headers.get('range')).toBe('bytes=100-199')
      return new Response('0123456789', {
        status: 206,
        headers: {
          'Content-Range': 'bytes 100-199/1000',
          'Accept-Ranges': 'bytes',
          'Content-Type': 'audio/mpeg',
          'Content-Length': '100',
          'Last-Modified': 'Wed, 01 Jan 2025 00:00:00 GMT',
        },
      })
    })
    const app = makeApp()

    const res = await app.request('/feed', { headers: { Range: 'bytes=100-199' } })

    expect(res.status).toBe(206)
    expect(res.headers.get('content-range')).toBe('bytes 100-199/1000')
    expect(res.headers.get('accept-ranges')).toBe('bytes')
    expect(res.headers.get('content-type')).toBe('audio/mpeg')
    expect(res.headers.get('content-length')).toBe('100')
    expect(res.headers.get('last-modified')).toBe('Wed, 01 Jan 2025 00:00:00 GMT')
    expect(await res.text()).toBe('0123456789')
  })

  it('relays upstream redirects unchanged (redirect: manual)', async () => {
    stubUpstream(async () => new Response(null, { status: 301, headers: { Location: '/images/open-graph.png' } }))
    const app = makeApp()

    const res = await app.request('/feed')

    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toBe('/images/open-graph.png')
  })

  it('answers 503 when the upstream fetch throws (core unreachable)', async () => {
    stubUpstream(async () => {
      throw new Error('ECONNREFUSED')
    })
    const app = makeApp()

    const res = await app.request('/feed')

    expect(res.status).toBe(503)
    expect(res.headers.get('content-type')).toContain('text/plain')
  })

  it('answers 503 when CORE_API_URL is not configured', async () => {
    const app = makeApp({ coreApiUrl: null })

    const res = await app.request('/feed')

    expect(res.status).toBe(503)
  })

  it('never proxies non-GET/HEAD methods (404, like core)', async () => {
    const upstream = stubUpstream(async () => new Response('proxied', { status: 200 }))
    const app = makeApp()

    const res = await app.request('/feed', { method: 'POST', body: 'x' })

    // POST /feed is not a core route either — the proxy must not forward
    // it (core answers the same POST with a plain 404).
    expect(upstream).not.toHaveBeenCalled()
    expect(res.status).toBe(404)
  })

  it('streams the upstream body through without buffering', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('part-1-'))
        controller.enqueue(new TextEncoder().encode('part-2'))
        controller.close()
      },
    })
    stubUpstream(async () => new Response(body, { status: 200, headers: { 'Content-Type': 'application/xml' } }))
    const app = makeApp()

    const res = await app.request('/feed')

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('part-1-part-2')
  })
})
