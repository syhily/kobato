// @vitest-environment node
import type { Env } from '@sayaka/server/hono-env'

import {
  buildForwardedRequestHeaders,
  forwardKobatoFamilies,
  isForwardedPath,
  stripHopByHopResponseHeaders,
} from '@sayaka/server/forward'
import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@sayaka/server/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sayaka/server/config')>()
  return { sayakaConfig: { ...actual.sayakaConfig, kobatoTimeoutMs: 20 } }
})

const DROPPED_INBOUND_HEADERS = [
  'forwarded',
  'x-forwarded-host',
  'x-real-ip',
  'cf-connecting-ip',
  'true-client-ip',
  'x-client-ip',
  'keep-alive',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
] as const

function socketEnv(remoteAddress: string) {
  return { incoming: { socket: { remoteAddress } } }
}

function makeApp() {
  const app = new Hono<Env>()
  app.use(forwardKobatoFamilies)
  return app
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isForwardedPath', () => {
  it('matches the two families exactly and by prefix', () => {
    for (const path of ['/rpc', '/rpc/public/content/home', '/admin', '/admin/setup', '/editor', '/editor/post/new']) {
      expect(isForwardedPath(path), path).toBe(true)
    }
  })

  it('rejects lookalike prefixes and everything else', () => {
    for (const path of ['/', '/rpcx', '/admins', '/editorial', '/assets/main.js', '/feed']) {
      expect(isForwardedPath(path), path).toBe(false)
    }
  })
})

describe('buildForwardedRequestHeaders', () => {
  it.each(DROPPED_INBOUND_HEADERS)('drops the inbound %s header', (name) => {
    const request = new Request('http://sayaka.local/rpc/x', {
      method: 'POST',
      headers: { [name]: 'spoofed', 'x-ordinary': 'kept' },
    })
    const headers = buildForwardedRequestHeaders(request, '198.51.100.7')
    expect(headers.has(name)).toBe(false)
  })

  it('drops every x-forwarded-* header by prefix, including ones kobato does not read today', () => {
    const request = new Request('http://sayaka.local/rpc/x', {
      headers: { 'x-forwarded-for': 'spoofed', 'x-forwarded-server': 'spoofed', 'x-forwarded-uri': 'spoofed' },
    })
    const headers = buildForwardedRequestHeaders(request, '198.51.100.7')
    expect(headers.get('x-forwarded-for')).toBe('198.51.100.7')
    expect(headers.has('x-forwarded-server')).toBe(false)
    expect(headers.has('x-forwarded-uri')).toBe(false)
  })

  it('asks kobato for identity encoding so sayaka is the only encoder on the path', () => {
    const request = new Request('http://sayaka.local/rpc/x', { headers: { 'accept-encoding': 'br, zstd' } })
    expect(buildForwardedRequestHeaders(request, undefined).get('accept-encoding')).toBe('identity')
  })

  it('drops the headers named by the connection header', () => {
    const request = new Request('http://sayaka.local/rpc/x', {
      headers: { connection: 'keep-alive, x-acme-hop', 'x-acme-hop': 'spoofed' },
    })
    const headers = buildForwardedRequestHeaders(request, undefined)
    expect(headers.has('connection')).toBe(false)
    expect(headers.has('x-acme-hop')).toBe(false)
    expect(headers.has('keep-alive')).toBe(false)
  })

  it('preserves ordinary headers', () => {
    const request = new Request('http://sayaka.local/rpc/x', {
      method: 'POST',
      headers: { cookie: '__csrf=abc', 'content-type': 'application/json', 'user-agent': 'smoke' },
    })
    const headers = buildForwardedRequestHeaders(request, undefined)
    expect(headers.get('cookie')).toBe('__csrf=abc')
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('user-agent')).toBe('smoke')
  })

  it('sets x-forwarded-for from the derived visitor address, replacing any spoofed value', () => {
    const request = new Request('http://sayaka.local/rpc/x', { headers: { 'x-forwarded-for': 'spoofed' } })
    expect(buildForwardedRequestHeaders(request, '198.51.100.7').get('x-forwarded-for')).toBe('198.51.100.7')
    expect(buildForwardedRequestHeaders(request, undefined).has('x-forwarded-for')).toBe(false)
  })

  it('sets x-forwarded-proto from the public request protocol, replacing any spoofed value', () => {
    const request = new Request('https://sayaka.local/admin/setup', { headers: { 'x-forwarded-proto': 'gopher' } })
    expect(buildForwardedRequestHeaders(request, undefined).get('x-forwarded-proto')).toBe('https')
  })
})

describe('stripHopByHopResponseHeaders', () => {
  it('strips hop-by-hop headers and connection-named tokens', () => {
    const upstream = new Headers({
      connection: 'x-acme-hop',
      'x-acme-hop': 'present',
      'transfer-encoding': 'chunked',
      'content-type': 'text/html',
    })
    const headers = stripHopByHopResponseHeaders(upstream)
    expect(headers.has('connection')).toBe(false)
    expect(headers.has('x-acme-hop')).toBe(false)
    expect(headers.has('transfer-encoding')).toBe(false)
    expect(headers.get('content-type')).toBe('text/html')
  })

  it('strips the framing headers because the fetch client already decoded the upstream body', () => {
    const upstream = new Headers({
      'content-encoding': 'gzip',
      'content-length': '27955',
      'content-type': 'application/json',
    })
    const headers = stripHopByHopResponseHeaders(upstream)
    expect(headers.has('content-encoding')).toBe(false)
    expect(headers.has('content-length')).toBe(false)
    expect(headers.get('content-type')).toBe('application/json')
  })

  it('preserves multiple set-cookie values', () => {
    const upstream = new Headers()
    upstream.append('set-cookie', '__csrf=one; Path=/')
    upstream.append('set-cookie', 'session=two; Path=/')
    const headers = stripHopByHopResponseHeaders(upstream)
    expect(headers.getSetCookie()).toEqual(['__csrf=one; Path=/', 'session=two; Path=/'])
  })
})

describe('forwardKobatoFamilies', () => {
  it('forwards method, query, streamed body, and the derived visitor address', async () => {
    const fetchMock = vi.fn(async () => new Response('upstream', { status: 201, statusText: 'Created' }))
    vi.stubGlobal('fetch', fetchMock)

    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"json":{}}'))
        controller.close()
      },
    })
    const app = makeApp()
    const response = await app.request(
      '/rpc/public/content/bootstrap?x=1',
      { method: 'POST', body, headers: { 'content-type': 'application/json' }, duplex: 'half' } as RequestInit,
      socketEnv('203.0.113.9'),
    )

    expect(response.status).toBe(201)
    expect(response.statusText).toBe('Created')
    expect(await response.text()).toBe('upstream')

    const [target, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit & { duplex?: string }]
    expect(target).toBe('http://127.0.0.1:4321/rpc/public/content/bootstrap?x=1')
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(ReadableStream)
    expect(init.duplex).toBe('half')
    expect(init.redirect).toBe('manual')
    const headers = new Headers(init.headers)
    expect(headers.get('x-forwarded-for')).toBe('203.0.113.9')
    expect(headers.get('x-forwarded-proto')).toBe('http')
  })

  it('passes the request through when the path is not forwarded', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const app = makeApp()
    const response = await app.request('/feed', {}, socketEnv('203.0.113.9'))
    expect(response.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('answers 502 with a short plain-text body when the upstream is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connect ECONNREFUSED')
      }),
    )
    const app = makeApp()
    const response = await app.request('/rpc/public/content/bootstrap', { method: 'POST' }, socketEnv('203.0.113.9'))
    expect(response.status).toBe(502)
    expect(await response.text()).toBe('Bad Gateway')
  })

  it('streams the upstream response body without buffering markers', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('chunk'))
        controller.close()
      },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(stream, { status: 200 })),
    )
    const app = makeApp()
    const response = await app.request('/admin/signin', {}, socketEnv('203.0.113.9'))
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('chunk')
  })

  it('answers 504 Gateway Timeout when kobato accepts the connection and never answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_target: string | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              'abort',
              () => {
                reject(init.signal?.reason)
              },
              { once: true },
            )
          }),
      ),
    )
    const app = makeApp()
    const response = await app.request('/rpc/public/content/bootstrap', { method: 'POST' }, socketEnv('203.0.113.9'))
    expect(response.status).toBe(504)
    expect(await response.text()).toBe('Gateway Timeout')
  })

  it('answers 502 Bad Gateway when kobato refuses the connection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:4321')
      }),
    )
    const app = makeApp()
    const response = await app.request('/editor/post/new', {}, socketEnv('203.0.113.9'))
    expect(response.status).toBe(502)
    expect(await response.text()).toBe('Bad Gateway')
  })

  it('keeps the declared 30-minute restore timeout on the forwarded /rpc path past the default', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 60))
        return new Response('restored', { status: 200 })
      }),
    )
    const app = makeApp()
    const response = await app.request('/rpc/account/setup/restore', { method: 'POST' }, socketEnv('203.0.113.9'))
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('restored')
  })

  it('releases the timeout once upstream headers arrive so a streamed body is never cut', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const stream = new ReadableStream({
          start(controller) {
            setTimeout(() => {
              controller.enqueue(new TextEncoder().encode('late-chunk'))
              controller.close()
            }, 80)
          },
        })
        return new Response(stream, { status: 200, headers: { 'content-type': 'font/woff2' } })
      }),
    )
    const app = makeApp()
    const response = await app.request('/admin/assets/fake-font.woff2', {}, socketEnv('203.0.113.9'))
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('late-chunk')
  })
})
