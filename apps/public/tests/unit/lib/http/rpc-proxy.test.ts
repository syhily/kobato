import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createRpcProxy } from '@/lib/http/rpc-proxy'

// The stage-3 same-origin /rpc write proxy: browser oRPC POST → frontend
// → core, with the phase-0.6 header family (frontend JWT, comment-token
// jar, X-Forwarded-*). These tests stub the upstream `fetch` and pin the
// exact header/body/response contract the frontend promises core.

const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
-----END PRIVATE KEY-----`

function makeApp(options?: Parameters<typeof createRpcProxy>[0]) {
  const app = new Hono()
  app.use('/rpc/*', createRpcProxy(options ?? { coreApiUrl: 'http://core:4321', privateKeyPem: null, keyId: null }))
  return app
}

/** Decode the JWT payload (the signer's signature is core-verified elsewhere). */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const payload = token.split('.')[1]
  if (payload === undefined) {
    throw new Error('malformed JWT')
  }
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>
}

const TOKEN_JAR = { 'pk-1': [{ token: 'visitor-tok', expiresAt: 4_102_444_800 }] }
const TOKEN_COOKIE = `__comment_tokens=${encodeURIComponent(JSON.stringify(TOKEN_JAR))}`

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

describe('createRpcProxy', () => {
  it('forwards the oRPC POST verbatim with the full proxy header family behind a key', async () => {
    let seen: Request | null = null
    const upstream = stubUpstream(async (request) => {
      seen = request
      return new Response(JSON.stringify({ json: { ok: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Set-Cookie': '__comment_tokens=next' },
      })
    })
    const app = makeApp({ coreApiUrl: 'http://core:4321', privateKeyPem: PRIVATE_KEY, keyId: 'key-1' })

    const res = await app.request(
      '/rpc/comments/replyComment',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: TOKEN_COOKIE,
          Origin: 'http://localhost',
          'User-Agent': 'Mozilla/5.0 test-browser',
        },
        body: JSON.stringify({ json: { page_key: 'pk-1' } }),
      },
      // A loopback peer — the operator reverse proxy on the same host —
      // is the only case where the proxy honours forwarding headers.
      { incoming: { socket: { remoteAddress: '127.0.0.1' } } },
    )

    expect(upstream).toHaveBeenCalledTimes(1)
    expect(seen).not.toBeNull()
    expect(seen!.url).toBe('http://core:4321/rpc/comments/replyComment')
    expect(seen!.method).toBe('POST')
    expect(await seen!.text()).toBe(JSON.stringify({ json: { page_key: 'pk-1' } }))

    const auth = seen!.headers.get('Authorization')
    expect(auth).toMatch(/^Bearer /)
    const payload = decodeJwtPayload(auth!.slice('Bearer '.length))
    expect(payload.iss).toBe('key-1')
    expect(payload.scope).toEqual(['content:write'])
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000))

    // The visitor jar rides the header (never raw cookies).
    expect(seen!.headers.get('X-Kobato-Comment-Token')).toBe(encodeURIComponent(JSON.stringify(TOKEN_JAR)))
    // The loopback peer's address is forwarded as the visitor IP.
    expect(seen!.headers.get('X-Forwarded-For')).toBe('127.0.0.1')
    expect(seen!.headers.get('X-Forwarded-User-Agent')).toBe('Mozilla/5.0 test-browser')
    expect(seen!.headers.get('user-agent')).toBe('Mozilla/5.0 test-browser')
    expect(seen!.headers.get('content-type')).toBe('application/json')
    // The frontend's own cookies never leave the domain.
    expect(seen!.headers.get('cookie')).toBeNull()

    // Response relayed verbatim, Set-Cookie included.
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ json: { ok: true } })
    expect(res.headers.get('Set-Cookie')).toBe('__comment_tokens=next')
  })

  it('never relays a browser-forged X-Forwarded-For from a remote peer', async () => {
    let seen: Request | null = null
    stubUpstream(async (request) => {
      seen = request
      return new Response('{}', { status: 200 })
    })
    const app = makeApp({ coreApiUrl: 'http://core:4321', privateKeyPem: PRIVATE_KEY, keyId: 'key-1' })

    const res = await app.request(
      '/rpc/comments/replyComment',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          // The visitor plants a fake address — a remote direct peer means
          // the proxy must ignore it and use the honest socket address.
          'X-Forwarded-For': '6.6.6.6',
        },
        body: '{}',
      },
      { incoming: { socket: { remoteAddress: '198.51.100.9' } } },
    )

    expect(res.status).toBe(200)
    expect(seen!.headers.get('X-Forwarded-For')).toBe('198.51.100.9')
  })

  it('omits X-Forwarded-For when no honest address is derivable', async () => {
    let seen: Request | null = null
    stubUpstream(async (request) => {
      seen = request
      return new Response('{}', { status: 200 })
    })
    const app = makeApp({ coreApiUrl: 'http://core:4321', privateKeyPem: PRIVATE_KEY, keyId: 'key-1' })

    const res = await app.request(
      '/rpc/comments/replyComment',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', 'X-Forwarded-For': '6.6.6.6' },
        body: '{}',
      },
      // No socket in the environment — the proxy cannot vouch for an IP.
      {},
    )

    expect(res.status).toBe(200)
    expect(seen!.headers.get('X-Forwarded-For')).toBeNull()
  })

  it('forwards anonymously when no key is configured (no JWT, no token/forwarding headers)', async () => {
    let seen: Request | null = null
    stubUpstream(async (request) => {
      seen = request
      return new Response('{}', { status: 200 })
    })
    const app = makeApp({ coreApiUrl: 'http://core:4321', privateKeyPem: null, keyId: null })

    const res = await app.request('/rpc/comments/replyComment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: TOKEN_COOKIE, 'User-Agent': 'Mozilla/5.0 test-browser' },
      body: '{"json":{}}',
    })

    expect(res.status).toBe(200)
    expect(seen!.headers.get('Authorization')).toBeNull()
    expect(seen!.headers.get('X-Kobato-Comment-Token')).toBeNull()
    expect(seen!.headers.get('X-Forwarded-For')).toBeNull()
    // The plain browser UA still flows for honest core records.
    expect(seen!.headers.get('user-agent')).toBe('Mozilla/5.0 test-browser')
  })

  it('answers 502 when CORE_API_URL is not configured', async () => {
    const upstream = stubUpstream(async () => new Response('{}', { status: 200 }))
    const app = makeApp({ coreApiUrl: null, privateKeyPem: null, keyId: null })

    const res = await app.request('/rpc/comments/replyComment', { method: 'POST', body: '{}' })
    expect(res.status).toBe(502)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('answers 502 when core is unreachable', async () => {
    stubUpstream(async () => {
      throw new TypeError('fetch failed')
    })
    const app = makeApp({ coreApiUrl: 'http://core:4321', privateKeyPem: null, keyId: null })

    const res = await app.request('/rpc/comments/replyComment', { method: 'POST', body: '{}' })
    expect(res.status).toBe(502)
  })

  it('rejects cross-origin browser writes and accepts same-origin ones', async () => {
    const upstream = stubUpstream(async () => new Response('{}', { status: 200 }))
    const app = makeApp({ coreApiUrl: 'http://core:4321', privateKeyPem: null, keyId: null })

    const cross = await app.request('/rpc/comments/replyComment', {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
      body: '{}',
    })
    expect(cross.status).toBe(403)
    expect(upstream).not.toHaveBeenCalled()

    const same = await app.request('/rpc/comments/replyComment', {
      method: 'POST',
      headers: { Origin: 'http://localhost' },
      body: '{}',
    })
    expect(same.status).toBe(200)
    expect(upstream).toHaveBeenCalledTimes(1)
  })

  it('accepts a browser https Origin behind a TLS-terminating proxy', async () => {
    const upstream = stubUpstream(async () => new Response('{}', { status: 200 }))
    const app = makeApp({ coreApiUrl: 'http://core:4321', privateKeyPem: null, keyId: null })

    // The browser used https; the operator proxy forwards plain HTTP with
    // `x-forwarded-proto: https` — without it the same-origin gate would
    // compare `https://site.com` against the socket-derived `http://site.com`.
    const res = await app.request('http://site.com/rpc/comments/replyComment', {
      method: 'POST',
      headers: {
        Origin: 'https://site.com',
        'x-forwarded-proto': 'https',
      },
      body: '{}',
    })
    expect(res.status).toBe(200)
    expect(upstream).toHaveBeenCalledTimes(1)

    // Without xfp the socket scheme (`http`) mismatches the https Origin.
    const noXfp = await app.request('http://site.com/rpc/comments/replyComment', {
      method: 'POST',
      headers: { Origin: 'https://site.com' },
      body: '{}',
    })
    expect(noXfp.status).toBe(403)

    // And a cross-origin Origin still loses even when xfp is present.
    const cross = await app.request('http://site.com/rpc/comments/replyComment', {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'x-forwarded-proto': 'https' },
      body: '{}',
    })
    expect(cross.status).toBe(403)
    expect(upstream).toHaveBeenCalledTimes(1)
  })

  it('forwards GETs (oRPC query reads) without a body', async () => {
    let seen: Request | null = null
    stubUpstream(async (request) => {
      seen = request
      return new Response('{}', { status: 200 })
    })
    const app = makeApp({ coreApiUrl: 'http://core:4321', privateKeyPem: null, keyId: null })

    const res = await app.request('/rpc/comments/loadComments?json=%7B%7D', { method: 'GET' })
    expect(res.status).toBe(200)
    expect(seen!.method).toBe('GET')
    expect(seen!.url).toBe('http://core:4321/rpc/comments/loadComments?json=%7B%7D')
    expect(seen!.body).toBeNull()
  })
})
