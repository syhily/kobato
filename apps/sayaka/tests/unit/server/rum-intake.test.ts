// @vitest-environment node
import type { Env } from '@sayaka/server/hono-env'

import { rumIntakeRelay } from '@sayaka/server/rum-intake'
import { installStubKobatoFetch, type InstalledStubKobatoFetch } from '@sayaka/tests/utils/stub-kobato'
import { Hono } from 'hono'
import { afterEach, describe, expect, it } from 'vitest'

let stub: InstalledStubKobatoFetch | null = null

function stubIntake(handler: (input: Record<string, unknown>) => unknown): InstalledStubKobatoFetch {
  stub = installStubKobatoFetch({ 'public.observability.rumIntake': handler })
  return stub
}

function relayApp(): Hono<Env> {
  const app = new Hono<Env>()
  app.use('*', rumIntakeRelay)
  app.all('*', (c) => c.json({ fell: 'through' }, 404))
  return app
}

function postRum(path: string, init: RequestInit = {}) {
  return relayApp().request(path, { method: 'POST', ...init }, {
    incoming: { socket: { remoteAddress: '203.0.113.9' } },
  } as never)
}

const OK_ACCEPTED = { kind: 'accepted' } as const

afterEach(() => {
  stub?.restore()
  stub = null
})

describe('sayaka RUM intake perimeter handler', () => {
  it('re-emits the captured disabled 404 through the procedure envelope', async () => {
    const stub = stubIntake(() => ({ kind: 'error', status: 404, message: 'RUM intake is disabled' }))
    const res = await postRum('/api/rum/intake/rum/v1/default/rum?o2-api-key=forged', { body: '{"type":"view"}' })
    expect(res.status).toBe(404)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(await res.text()).toBe('{"error":{"message":"RUM intake is disabled"}}')
    expect(stub.calls).toHaveLength(1)
  })

  it('re-emits the captured 202 with no-store and an empty body', async () => {
    stubIntake(() => OK_ACCEPTED)
    const res = await postRum('/api/rum/intake/rum/v1/default/rum?o2source=browser&o2-api-key=forged', {
      body: '{"type":"view"}',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
    })
    expect(res.status).toBe(202)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.text()).toBe('')
  })

  it('re-emits the captured 429 with its Retry-After hint', async () => {
    stubIntake(() => ({ kind: 'error', status: 429, message: 'Too many requests', retryAfterSeconds: 60 }))
    const res = await postRum('/api/rum/intake/rum/v1/default/rum', { body: '{"type":"view"}' })
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('60')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.text()).toBe('{"error":{"message":"Too many requests"}}')
  })

  it('re-emits the captured 502 with its Retry-After hint', async () => {
    stubIntake(() => ({ kind: 'error', status: 502, message: 'RUM relay failed', retryAfterSeconds: 5 }))
    const res = await postRum('/api/rum/intake/rum/v1/default/rum', { body: '{"type":"view"}' })
    expect(res.status).toBe(502)
    expect(res.headers.get('Retry-After')).toBe('5')
    expect(await res.text()).toBe('{"error":{"message":"RUM relay failed"}}')
  })

  it.each([
    ['gzip', '/api/rum/intake/rum/v1/default/rum'],
    ['br', '/api/rum/intake/rum/v1/default/rum'],
    ['deflate', '/api/rum/intake/rum/v1/default/rum'],
  ])(
    'vetoes a compressed %s batch locally with the captured 415 and never calls the procedure',
    async (encoding, path) => {
      const stub = stubIntake(() => OK_ACCEPTED)
      const res = await postRum(path, { body: '{}', headers: { 'content-encoding': encoding } })
      expect(res.status).toBe(415)
      expect(res.headers.get('Cache-Control')).toBe('no-store')
      expect(await res.text()).toBe('{"error":{"message":"Compressed RUM batches are not accepted"}}')
      expect(stub.calls).toHaveLength(0)
    },
  )

  it('lets an identity content-encoding through to the procedure', async () => {
    const stub = stubIntake(() => OK_ACCEPTED)
    const res = await postRum('/api/rum/intake/rum/v1/default/rum', {
      body: '{}',
      headers: { 'content-encoding': 'identity' },
    })
    expect(res.status).toBe(202)
    expect(stub.calls).toHaveLength(1)
  })

  it('rejects an over-long declared content-length locally with the captured 413', async () => {
    const stub = stubIntake(() => OK_ACCEPTED)
    const res = await postRum('/api/rum/intake/rum/v1/default/rum', {
      body: 'A'.repeat(1024 * 1024 + 1),
      headers: { 'content-type': 'text/plain' },
    })
    expect(res.status).toBe(413)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.text()).toBe('{"error":{"message":"Batch too large"}}')
    expect(stub.calls).toHaveLength(0)
  })

  it('cuts a length-less streamed batch at the byte cap with the captured 413', async () => {
    const stub = stubIntake(() => OK_ACCEPTED)
    const chunk = new Uint8Array(256 * 1024).fill(65)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let index = 0; index < 8; index += 1) {
          controller.enqueue(chunk)
        }
        controller.close()
      },
    })
    const res = await postRum('/api/rum/intake/rum/v1/default/rum', {
      body: stream,
      headers: { 'content-type': 'text/plain' },
      // @ts-expect-error — Node's undici Request requires `duplex` for stream bodies
      duplex: 'half',
    })
    expect(res.status).toBe(413)
    expect(await res.text()).toBe('{"error":{"message":"Batch too large"}}')
    expect(stub.calls).toHaveLength(0)
  })

  it('passes the raw track, raw query, decoded body, and content type to the procedure', async () => {
    const stub = stubIntake(() => OK_ACCEPTED)
    await postRum('/api/rum/intake/rum/v1/other-org/rum?o2source=browser&o2-api-key=forged&batch_time=123', {
      body: '{"type":"view"}\n{"type":"resource"}',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
    })
    expect(stub.calls).toEqual([
      {
        path: 'public.observability.rumIntake',
        input: {
          track: '/rum/v1/other-org/rum',
          query: 'o2source=browser&o2-api-key=forged&batch_time=123',
          body: '{"type":"view"}\n{"type":"resource"}',
          contentType: 'text/plain;charset=UTF-8',
        },
      },
    ])
  })

  it('sends a null content type when the batch carries none', async () => {
    const stub = stubIntake(() => OK_ACCEPTED)
    await postRum('/api/rum/intake/rum/v1/default/rum', { body: new Blob(['{"type":"view"}']) })
    expect(stub.calls[0]!.input).toMatchObject({ contentType: null })
  })

  it('keys the relay on the forwarded visitor address', async () => {
    const stub = stubIntake(() => OK_ACCEPTED)
    await postRum('/api/rum/intake/rum/v1/default/rum', { body: '{"type":"view"}' })
    expect(stub.requests).toHaveLength(1)
    expect(stub.requests[0]!.forwardedFor).toBe('203.0.113.9')
  })

  it('answers 502 Bad Gateway when kobato is unreachable', async () => {
    const previous = globalThis.fetch
    globalThis.fetch = async () => {
      throw new Error('connection refused')
    }
    try {
      const res = await postRum('/api/rum/intake/rum/v1/default/rum', { body: '{"type":"view"}' })
      expect(res.status).toBe(502)
      expect(res.headers.get('Cache-Control')).toBe('no-store')
      expect(res.headers.get('Content-Type')).toBe('text/plain;charset=UTF-8')
      expect(await res.text()).toBe('Bad Gateway')
    } finally {
      globalThis.fetch = previous
    }
  })

  it.each([
    ['GET', '/api/rum/intake/rum/v1/default/rum'],
    ['POST', '/api/rum/intake'],
    ['POST', '/api/rum/other'],
    ['POST', '/api/rum/intakes/rum/v1/default/rum'],
  ])('leaves %s %s to the rest of the perimeter', async (method, path) => {
    const stubbed = stubIntake(() => OK_ACCEPTED)
    const res = await relayApp().request(path, { method }, {
      incoming: { socket: { remoteAddress: '203.0.113.9' } },
    } as never)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ fell: 'through' })
    expect(stubbed.calls).toHaveLength(0)
  })
})
