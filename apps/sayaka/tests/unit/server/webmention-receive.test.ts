// @vitest-environment node
import type { Env } from '@sayaka/server/hono-env'

import { ORPCError } from '@orpc/contract'
import { webmentionReceive } from '@sayaka/server/webmention-receive'
import { installStubKobatoFetch, type InstalledStubKobatoFetch } from '@sayaka/tests/utils/stub-kobato'
import { Hono } from 'hono'
import { afterEach, describe, expect, it } from 'vitest'

const INVALID_BODY = '{"error":{"message":"Invalid webmention request: source and target must be valid http(s) URLs"}}'
const DISABLED_BODY = '{"error":{"message":"This endpoint no longer accepts webmentions"}}'
const NOT_FOUND_BODY =
  '{"error":{"code":"NOT_FOUND","message":"target is not a resource on this site","descriptor":{"messageKey":"error.api.rawMessage","params":{"message":"target is not a resource on this site"},"fallbackMessage":"target is not a resource on this site"}}}'
const RATE_LIMITED_BODY =
  '{"error":{"code":"TOO_MANY_REQUESTS","message":"Too many requests. Please try again later.","descriptor":{"messageKey":"error.api.rateLimited","fallbackMessage":"Too many requests. Please try again later."}}}'

let stub: InstalledStubKobatoFetch | null = null

function stubReceive(handler: (input: Record<string, unknown>) => unknown): InstalledStubKobatoFetch {
  stub = installStubKobatoFetch({ 'public.webmentions.receive': handler })
  return stub
}

function relayApp(): Hono<Env> {
  const app = new Hono<Env>()
  app.use('*', webmentionReceive)
  app.all('*', (c) => c.json({ fell: 'through' }, 404))
  return app
}

function postWebmention(form: Record<string, string>, init: RequestInit = {}) {
  return relayApp().request(
    '/webmention',
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
      ...init,
    },
    { incoming: { socket: { remoteAddress: '203.0.113.9' } } as never },
  )
}

const NOT_FOUND_ERROR = () => {
  throw new ORPCError('NOT_FOUND', {
    status: 404,
    message: 'target is not a resource on this site',
    data: {
      descriptor: {
        messageKey: 'error.api.rawMessage',
        params: { message: 'target is not a resource on this site' },
        fallbackMessage: 'target is not a resource on this site',
      },
    },
  })
}

afterEach(() => {
  stub?.restore()
  stub = null
})

describe('sayaka Webmention receive perimeter handler', () => {
  it('answers the captured 202 pending body when the procedure accepts', async () => {
    const stubbed = stubReceive(() => ({ kind: 'accepted' }))
    const res = await postWebmention({
      source: 'https://sender.example/blog/mentioning-post',
      target: 'https://example.com/posts/wm-target',
    })
    expect(res.status).toBe(202)
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(await res.text()).toBe('{"status":"pending"}')
    expect(stubbed.calls).toEqual([
      {
        path: 'public.webmentions.receive',
        input: {
          source: 'https://sender.example/blog/mentioning-post',
          target: 'https://example.com/posts/wm-target',
        },
      },
    ])
  })

  it('answers the captured 400 body when the procedure calls the form invalid', async () => {
    const stubbed = stubReceive(() => ({
      kind: 'invalid',
      message: 'Invalid webmention request: source and target must be valid http(s) URLs',
    }))
    const res = await postWebmention({ source: 'not-a-url', target: 'https://example.com/posts/wm-target' })
    expect(res.status).toBe(400)
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(await res.text()).toBe(INVALID_BODY)
    expect(stubbed.calls).toHaveLength(1)
  })

  it('passes the missing form fields as empty strings for the procedure to judge', async () => {
    const stubbed = stubReceive(() => ({ kind: 'invalid', message: 'x' }))
    await postWebmention({ target: 'https://example.com/posts/wm-target' })
    expect(stubbed.calls[0]!.input).toEqual({ source: '', target: 'https://example.com/posts/wm-target' })
    await postWebmention({})
    expect(stubbed.calls[1]!.input).toEqual({ source: '', target: '' })
  })

  it('answers the captured 410 body when receiving is disabled', async () => {
    stubReceive(() => ({ kind: 'disabled', message: 'This endpoint no longer accepts webmentions' }))
    const res = await postWebmention({
      source: 'https://sender.example/blog/mentioning-post',
      target: 'https://example.com/posts/wm-target',
    })
    expect(res.status).toBe(410)
    expect(await res.text()).toBe(DISABLED_BODY)
  })

  it('re-emits the captured NOT_FOUND error body for an unknown target', async () => {
    stubReceive(NOT_FOUND_ERROR)
    const res = await postWebmention({
      source: 'https://sender.example/blog/mentioning-post',
      target: 'https://example.com/posts/no-such-post',
    })
    expect(res.status).toBe(404)
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(await res.text()).toBe(NOT_FOUND_BODY)
  })

  it('re-emits the captured TOO_MANY_REQUESTS error body for an exhausted bucket', async () => {
    stubReceive(() => {
      throw new ORPCError('TOO_MANY_REQUESTS', {
        status: 429,
        message: 'Too many requests. Please try again later.',
        data: {
          descriptor: {
            messageKey: 'error.api.rateLimited',
            fallbackMessage: 'Too many requests. Please try again later.',
          },
        },
      })
    })
    const res = await postWebmention({
      source: 'https://sender.example/blog/mentioning-post',
      target: 'https://example.com/posts/wm-target',
    })
    expect(res.status).toBe(429)
    expect(await res.text()).toBe(RATE_LIMITED_BODY)
  })

  it('maps the RATE_LIMITED queue-full error onto 429', async () => {
    stubReceive(() => {
      throw new ORPCError('RATE_LIMITED', {
        status: 429,
        message: 'webmention queue is full',
        data: {
          descriptor: { messageKey: 'webmentions.error.queueFull', fallbackMessage: 'webmention queue is full' },
        },
      })
    })
    const res = await postWebmention({
      source: 'https://sender.example/blog/mentioning-post',
      target: 'https://example.com/posts/wm-target',
    })
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ error: { code: 'RATE_LIMITED', message: 'webmention queue is full' } })
  })

  it('rejects a form whose declared content-length exceeds the 16 KiB cap with the captured 413 body', async () => {
    const stubbed = stubReceive(() => ({ kind: 'accepted' }))
    const res = await postWebmention(
      { source: 'a', target: 'b' },
      {
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'content-length': String(20 * 1024) },
        body: 'x'.repeat(20 * 1024),
      },
    )
    expect(res.status).toBe(413)
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(await res.text()).toBe('{"error":{"message":"Payload too large"}}')
    expect(stubbed.calls).toHaveLength(0)
  })

  it('rejects a chunked form whose body exceeds the 16 KiB cap', async () => {
    const stubbed = stubReceive(() => ({ kind: 'accepted' }))
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(20 * 1024)))
        controller.close()
      },
    })
    const res = await relayApp().request(
      '/webmention',
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: stream,
        // @ts-expect-error — Node's undici Request requires `duplex` for stream bodies
        duplex: 'half',
      },
      { incoming: { socket: { remoteAddress: '203.0.113.9' } } as never },
    )
    expect(res.status).toBe(413)
    expect(await res.text()).toBe('{"error":{"message":"Payload too large"}}')
    expect(stubbed.calls).toHaveLength(0)
  })

  it('keys the receive on the forwarded visitor address', async () => {
    const stubbed = stubReceive(() => ({ kind: 'accepted' }))
    await postWebmention({ source: 'https://sender.example/a', target: 'https://example.com/posts/x' })
    expect(stubbed.requests).toHaveLength(1)
    expect(stubbed.requests[0]!.forwardedFor).toBe('203.0.113.9')
  })

  it('answers 502 Bad Gateway when kobato is unreachable', async () => {
    const previous = globalThis.fetch
    globalThis.fetch = async () => {
      throw new Error('connection refused')
    }
    try {
      const res = await postWebmention({ source: 'https://sender.example/a', target: 'https://example.com/posts/x' })
      expect(res.status).toBe(502)
      expect(await res.text()).toBe('Bad Gateway')
    } finally {
      globalThis.fetch = previous
    }
  })

  it.each([
    ['GET', '/webmention'],
    ['POST', '/webmentions'],
    ['POST', '/webmention/extra'],
  ])('leaves %s %s to the rest of the perimeter', async (method, path) => {
    const stubbed = stubReceive(() => ({ kind: 'accepted' }))
    const res = await relayApp().request(path, { method }, {
      incoming: { socket: { remoteAddress: '203.0.113.9' } },
    } as never)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ fell: 'through' })
    expect(stubbed.calls).toHaveLength(0)
  })
})
