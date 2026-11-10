import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'
import type { SafeFetchOptions, SafeFetchResult } from '@/server/infra/safe-fetch'
import type { FrontendRumRelay } from '@/server/infra/trace/config'

const relay = vi.hoisted(() => ({ current: null as FrontendRumRelay | null }))
const upstream = vi.hoisted(() => ({
  calls: [] as Array<{ url: string; options: SafeFetchOptions }>,
  result: {
    ok: true,
    url: '',
    response: new Response(null, { status: 200 }),
    body: new ArrayBuffer(0),
  } as SafeFetchResult,
  rateLimited: false,
}))

vi.mock('@/server/infra/trace/config', () => ({
  activeFrontendRelay: () => relay.current,
}))

vi.mock('@/server/infra/safe-fetch', () => ({
  safeFetch: async (url: string, options: SafeFetchOptions) => {
    upstream.calls.push({ url, options })
    return upstream.result
  },
}))

vi.mock('@/server/infra/rate-limit', () => ({
  tryRumIntakeRateLimit: async () => ({ exceeded: upstream.rateLimited }),
}))

const relayMetrics = vi.hoisted(() => ({
  recordRumRelayOutcome: vi.fn(),
}))

vi.mock('@/server/infra/trace/metrics', () => relayMetrics)

import { rumIntakeRouter } from '@/server/http/resources/rum-intake'

const RELAY: FrontendRumRelay = {
  endpoint: 'http://10.0.0.5:5080',
  organization: 'default',
  clientToken: 'real-rum-token',
  clientIdentity: 'anonymous',
}

function app(): Hono<Env> {
  const hono = new Hono<Env>()
  hono.use('*', async (c, next) => {
    c.set('requestContext', { clientAddress: '203.0.113.7' } as never)
    await next()
  })
  return hono.route('/', rumIntakeRouter)
}

function postBatch(
  path: string,
  init: { body?: string; contentType?: string; contentLength?: string; contentEncoding?: string } = {},
) {
  const headers: Record<string, string> = {}
  if (init.contentType !== undefined) {
    headers['content-type'] = init.contentType
  }
  if (init.contentLength !== undefined) {
    headers['content-length'] = init.contentLength
  }
  if (init.contentEncoding !== undefined) {
    headers['content-encoding'] = init.contentEncoding
  }
  return app().request(path, { method: 'POST', body: init.body ?? '{"type":"view"}', headers })
}

beforeEach(() => {
  relay.current = RELAY
  upstream.calls = []
  upstream.result = { ok: true, url: '', response: new Response(null, { status: 200 }), body: new ArrayBuffer(0) }
  upstream.rateLimited = false
  relayMetrics.recordRumRelayOutcome.mockReset()
})

describe('rumIntakeRouter', () => {
  it('answers 404 and never forwards while the verification gate is closed', async () => {
    relay.current = null

    const res = await postBatch('/api/rum/intake/rum/v1/default/rum?o2-api-key=kobato-relay')

    expect(res.status).toBe(404)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(upstream.calls).toHaveLength(0)
  })

  it.each([
    '/api/rum/intake/rum/replay/sessions/abc?o2-api-key=kobato-relay',
    '/api/rum/intake/rum/v1/default/logs?o2-api-key=kobato-relay',
    '/api/rum/intake/rum/v2/default/rum?o2-api-key=kobato-relay',
    '/api/rum/intake/rum/v1/bad.org/rum?o2-api-key=kobato-relay',
    '/api/rum/intake/rum/v1//rum?o2-api-key=kobato-relay',
    '/api/rum/intake/?o2-api-key=kobato-relay',
  ])('fails closed on the sub-path %s', async (path) => {
    const res = await postBatch(path)

    expect(res.status).toBe(404)
    expect(upstream.calls).toHaveLength(0)
  })

  it('discards the inbound organization segment and forwards to the configured one', async () => {
    // The browser never learns the configured organization: the slim SDK
    // builds `/rum/v1/default/rum` unless told otherwise, so the relay
    // validates only the track shape and rewrites the upstream org.
    const res = await postBatch('/api/rum/intake/rum/v1/other-org/rum?o2-api-key=kobato-relay')

    expect(res.status).toBe(202)
    expect(upstream.calls).toHaveLength(1)
    expect(new URL(upstream.calls[0]!.url).pathname).toBe('/rum/v1/default/rum')
  })

  it('rejects an overlong query and an oversized declared body before reading', async () => {
    const longQuery = await postBatch(`/api/rum/intake/rum/v1/default/rum?x=${'a'.repeat(5000)}`)
    expect(longQuery.status).toBe(414)

    const tooLarge = await postBatch('/api/rum/intake/rum/v1/default/rum', { contentLength: String(2 * 1024 * 1024) })
    expect(tooLarge.status).toBe(413)

    expect(upstream.calls).toHaveLength(0)
    expect(relayMetrics.recordRumRelayOutcome).toHaveBeenCalledTimes(1)
    expect(relayMetrics.recordRumRelayOutcome).toHaveBeenCalledWith('oversized')
  })

  it('cuts a length-less streamed body at the byte cap during the read', async () => {
    const chunk = new Uint8Array(256 * 1024).fill(65)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let index = 0; index < 8; index += 1) {
          controller.enqueue(chunk)
        }
        controller.close()
      },
    })

    const res = await app().request('/api/rum/intake/rum/v1/default/rum', {
      method: 'POST',
      body: stream,
      // @ts-expect-error Node's undici Request requires `duplex` for streams.
      duplex: 'half',
    })

    expect(res.status).toBe(413)
    expect(upstream.calls).toHaveLength(0)
  })

  it('vetoes a compressed batch (415) the relay could only corrupt, but allows identity', async () => {
    const gzip = await postBatch('/api/rum/intake/rum/v1/default/rum', { contentEncoding: 'gzip' })
    expect(gzip.status).toBe(415)

    const brotli = await postBatch('/api/rum/intake/rum/v1/default/rum', { contentEncoding: 'br' })
    expect(brotli.status).toBe(415)

    const identity = await postBatch('/api/rum/intake/rum/v1/default/rum', { contentEncoding: 'identity' })
    expect(identity.status).toBe(202)

    expect(upstream.calls).toHaveLength(1)
  })

  it('answers 429 with a Retry-After hint when the per-IP relay bucket is exhausted', async () => {
    upstream.rateLimited = true

    const res = await postBatch('/api/rum/intake/rum/v1/default/rum')

    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('60')
    expect(upstream.calls).toHaveLength(0)
    expect(relayMetrics.recordRumRelayOutcome).toHaveBeenCalledWith('rate_limited')
  })

  it('forwards the batch with the real token injected and every inbound o2-api-key dropped', async () => {
    const res = await postBatch(
      '/api/rum/intake/rum/v1/default/rum?o2source=browser&o2-api-key=kobato-relay&o2-api-key=forged&batch_time=123',
      { body: '{"type":"view"}\n{"type":"resource"}', contentType: 'text/plain;charset=UTF-8' },
    )

    expect(res.status).toBe(202)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.text()).toBe('')
    expect(relayMetrics.recordRumRelayOutcome).toHaveBeenCalledWith('ok')

    expect(upstream.calls).toHaveLength(1)
    const call = upstream.calls[0]!
    const url = new URL(call.url)
    expect(url.origin).toBe('http://10.0.0.5:5080')
    expect(url.pathname).toBe('/rum/v1/default/rum')
    expect(url.searchParams.getAll('o2-api-key')).toEqual(['real-rum-token'])
    expect(url.searchParams.get('o2source')).toBe('browser')
    expect(url.searchParams.get('batch_time')).toBe('123')
    expect(call.url).not.toContain('kobato-relay')
    expect(call.url).not.toContain('forged')

    expect(call.options.method).toBe('POST')
    expect(call.options.body).toBe('{"type":"view"}\n{"type":"resource"}')
    expect(call.options.headers).toEqual({ 'content-type': 'text/plain;charset=UTF-8' })
    expect(call.options.trustedOrigin).toBe('http://10.0.0.5:5080')
    expect(call.options.maxRedirects).toBe(0)
    expect(call.options.operation).toBe('observability.rum.relay')
  })

  it('attaches the client address and the original User-Agent only in forward mode', async () => {
    relay.current = { ...RELAY, clientIdentity: 'forward' }

    const res = await app().request('/api/rum/intake/rum/v1/default/rum?o2-api-key=kobato-relay', {
      method: 'POST',
      body: '{"type":"view"}',
      headers: { 'user-agent': 'Mozilla/5.0 (Kobato Test Browser)' },
    })

    expect(res.status).toBe(202)
    expect(upstream.calls).toHaveLength(1)
    expect(upstream.calls[0]!.options.headers).toEqual({
      'content-type': 'text/plain;charset=UTF-8',
      'x-forwarded-for': '203.0.113.7',
      'user-agent': 'Mozilla/5.0 (Kobato Test Browser)',
    })
  })

  it('omits the User-Agent in forward mode when the browser sent none', async () => {
    relay.current = { ...RELAY, clientIdentity: 'forward' }

    const res = await postBatch('/api/rum/intake/rum/v1/default/rum?o2-api-key=kobato-relay')

    expect(res.status).toBe(202)
    const headers = upstream.calls[0]!.options.headers as Record<string, string>
    expect(headers['x-forwarded-for']).toBe('203.0.113.7')
    expect(headers).not.toHaveProperty('user-agent')
  })

  it('forwards no request identity in the default anonymous mode', async () => {
    const res = await app().request('/api/rum/intake/rum/v1/default/rum?o2-api-key=kobato-relay', {
      method: 'POST',
      body: '{"type":"view"}',
      headers: { 'user-agent': 'Mozilla/5.0 (Kobato Test Browser)' },
    })

    expect(res.status).toBe(202)
    const headers = upstream.calls[0]!.options.headers as Record<string, string>
    expect(headers).not.toHaveProperty('x-forwarded-for')
    expect(headers).not.toHaveProperty('user-agent')
  })

  it('never reflects the upstream detail or the token to the caller on failure', async () => {
    upstream.result = { ok: false, reason: 'http-error', url: 'http://10.0.0.5:5080/rum', status: 500, error: null }

    const res = await postBatch('/api/rum/intake/rum/v1/default/rum?o2-api-key=kobato-relay')
    const body = await res.text()

    expect(res.status).toBe(502)
    expect(res.headers.get('Retry-After')).toBe('5')
    expect(body).not.toContain('10.0.0.5')
    expect(body).not.toContain('real-rum-token')
    expect(body).not.toContain('500')
    expect(relayMetrics.recordRumRelayOutcome).toHaveBeenCalledWith('upstream_error')
  })
})
