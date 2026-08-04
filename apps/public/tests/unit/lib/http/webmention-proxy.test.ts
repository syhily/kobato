import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createWebmentionProxy } from '@/lib/http/webmention-proxy'

// The phase-2 POST /webmention proxy: buffers the ≤16 KB form body and
// forwards it to core with the proxy header family. These tests stub the
// upstream `fetch` and pin the body-cap, header, and relay contract.

const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
-----END PRIVATE KEY-----`

function makeApp(options?: Parameters<typeof createWebmentionProxy>[0]) {
  const app = new Hono()
  app.post(
    '/webmention',
    createWebmentionProxy(options ?? { coreApiUrl: 'http://core:4321', privateKeyPem: null, keyId: null }),
  )
  return app
}

function stubUpstream(handler: (request: Request) => Response | Promise<Response>) {
  const upstream = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    return handler(new Request(input, init))
  })
  vi.stubGlobal('fetch', upstream)
  return upstream
}

const FORM_BODY = 'source=https%3A%2F%2Fexample.com%2Fpost&target=https%3A%2F%2Fblog.example.com%2Farticle'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createWebmentionProxy', () => {
  it('forwards the form POST to core with a signed JWT + visitor IP behind a key', async () => {
    let seen: Request | null = null
    const upstream = stubUpstream(async (request) => {
      seen = request
      return new Response(JSON.stringify({ status: 'pending' }), { status: 202 })
    })
    const app = makeApp({ coreApiUrl: 'http://core:4321', privateKeyPem: PRIVATE_KEY, keyId: 'key-1' })

    const res = await app.request(
      '/webmention',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'webmention-sender/1.0',
        },
        body: FORM_BODY,
      },
      // A loopback peer — the operator's reverse proxy — is the only
      // case where the forwarded IP is honest (same trust chain as /rpc).
      { incoming: { socket: { remoteAddress: '127.0.0.1' } } },
    )

    expect(upstream).toHaveBeenCalledTimes(1)
    expect(seen).not.toBeNull()
    expect(seen!.url).toBe('http://core:4321/webmention')
    expect(seen!.method).toBe('POST')
    expect(await seen!.text()).toBe(FORM_BODY)
    expect(seen!.headers.get('content-type')).toBe('application/x-www-form-urlencoded')
    expect(seen!.headers.get('user-agent')).toBe('webmention-sender/1.0')
    expect(seen!.headers.get('x-forwarded-for')).toBe('127.0.0.1')
    expect(seen!.headers.get('authorization')).toMatch(/^Bearer /)

    expect(res.status).toBe(202)
  })

  it('forwards anonymously without a key (no JWT, no forwarding headers)', async () => {
    let seen: Request | null = null
    stubUpstream(async (request) => {
      seen = request
      return new Response(JSON.stringify({ status: 'pending' }), { status: 202 })
    })
    const app = makeApp()

    const res = await app.request(
      '/webmention',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: FORM_BODY,
      },
      { incoming: { socket: { remoteAddress: '127.0.0.1' } } },
    )

    expect(seen).not.toBeNull()
    expect(seen!.headers.has('authorization')).toBe(false)
    expect(seen!.headers.has('x-forwarded-for')).toBe(false)
    expect(res.status).toBe(202)
  })

  it('relays core rejections verbatim (400 / 410 / 413 / 429)', async () => {
    stubUpstream(async () => new Response(JSON.stringify({ error: { message: 'no longer accepts' } }), { status: 410 }))
    const app = makeApp()

    const res = await app.request('/webmention', { method: 'POST', body: FORM_BODY })

    expect(res.status).toBe(410)
    expect(await res.json()).toEqual({ error: { message: 'no longer accepts' } })
  })

  it('refuses bodies over 16 KB with 413 (declared content-length)', async () => {
    const upstream = stubUpstream(async () => new Response(null, { status: 202 }))
    const app = makeApp()

    const big = 'a'.repeat(16 * 1024 + 1)
    const res = await app.request('/webmention', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': String(big.length) },
      body: big,
    })

    expect(res.status).toBe(413)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('refuses bodies over 16 KB with 413 even without content-length (buffered + measured)', async () => {
    const upstream = stubUpstream(async () => new Response(null, { status: 202 }))
    const app = makeApp()

    const res = await app.request('/webmention', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'a'.repeat(16 * 1024 + 1),
    })

    expect(res.status).toBe(413)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('answers 503 when core is unreachable', async () => {
    stubUpstream(async () => {
      throw new Error('ECONNREFUSED')
    })
    const app = makeApp()

    const res = await app.request('/webmention', { method: 'POST', body: FORM_BODY })

    expect(res.status).toBe(503)
  })
})
