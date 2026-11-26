import type { KobatoServerClientOptions } from '@kobato/api/client/create-server-client'
import type { apiContract } from '@kobato/api/contract'
import type { ContractRouterClient } from '@orpc/contract'

import { createKobatoServerClient } from '@kobato/api/client/create-server-client'
import { RESOURCE_STREAM_HEADER } from '@kobato/api/client/resource-stream'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'

interface CapturedCall {
  url: string
  method: string
  headers: Headers
}

function makeCapturingFetch(calls: CapturedCall[], setCookies: string[] = []): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    calls.push({ url: request.url, method: request.method, headers: request.headers })
    return new Response(JSON.stringify({ json: null }), {
      status: 200,
      headers: [
        ['content-type', 'application/json'],
        ...setCookies.map((cookie): [string, string] => ['set-cookie', cookie]),
      ],
    })
  }
}

const FORWARDED_HEADERS: Record<string, string> = {
  cookie: '__session=abc; __csrf=def',
  'user-agent': 'Mozilla/5.0 (Test Browser)',
  'accept-language': 'zh-CN,zh;q=0.9',
  referer: 'https://sayaka.example/posts/hello',
  purpose: 'prefetch',
  'sec-purpose': 'prefetch',
  traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
  tracestate: 'congo=t61rcWkgMzE',
  'sec-ch-ua': '"Chromium";v="140", "Not=A?Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-ch-ua-platform-version': '"26.1.0"',
  'sec-ch-ua-model': '""',
  'sec-ch-ua-full-version': '"140.0.7339.0"',
  'sec-ch-ua-full-version-list': '"Chromium";v="140.0.7339.0"',
  'sec-ch-ua-arch': '"arm"',
  'sec-ch-ua-bitness': '"64"',
  'sec-ch-ua-form-factors': '"Desktop"',
}

const BLOCKED_HEADERS: Record<string, string> = {
  'x-csrf-token': 'attacker-chosen-token',
  'cf-connecting-ip': '203.0.113.99',
  'x-real-ip': '203.0.113.99',
  'x-forwarded-for': '203.0.113.99',
  host: 'evil.example',
  'content-type': 'text/plain',
  'content-length': '5',
  authorization: 'Bearer secret',
  'accept-encoding': 'br',
  'x-api-key': 'secret',
}

function inboundRequest(extra: Record<string, string> = {}): Request {
  return new Request('https://sayaka.example/posts/hello', {
    headers: { ...FORWARDED_HEADERS, ...BLOCKED_HEADERS, ...extra },
  })
}

async function captureCall(clientAddress?: string): Promise<CapturedCall> {
  const calls: CapturedCall[] = []
  const { client } = createKobatoServerClient({
    url: 'https://kobato.internal/rpc',
    request: inboundRequest(),
    ...(clientAddress === undefined ? {} : { clientAddress }),
    fetch: makeCapturingFetch(calls),
  })
  await client.public.content.bootstrap()
  expect(calls).toHaveLength(1)
  return calls[0]!
}

function makeHangingFetch(): NonNullable<KobatoServerClientOptions['fetch']> {
  return (_request, init) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = (init as { signal?: AbortSignal }).signal
      signal?.addEventListener(
        'abort',
        () => {
          reject(signal.reason)
        },
        { once: true },
      )
    })
}

async function flush(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

describe('api/client/create-server-client — forwarded header policy', () => {
  it.each(Object.entries(FORWARDED_HEADERS))('forwards %s from the inbound request', async (name, value) => {
    const call = await captureCall()
    expect(call.headers.get(name)).toBe(value)
  })

  it.each(Object.keys(BLOCKED_HEADERS))('never forwards the inbound %s', async (name) => {
    const call = await captureCall()
    expect(call.headers.get(name)).not.toBe(BLOCKED_HEADERS[name])
  })

  it.each(['x-csrf-token', 'cf-connecting-ip', 'x-real-ip', 'x-forwarded-for', 'host'])(
    'omits %s entirely',
    async (name) => {
      const call = await captureCall()
      expect(call.headers.get(name)).toBeNull()
    },
  )

  it('sends the caller-derived visitor address as X-Forwarded-For', async () => {
    const call = await captureCall('198.51.100.23')
    expect(call.headers.get('x-forwarded-for')).toBe('198.51.100.23')
  })

  it('omits X-Forwarded-For when the caller derived no address', async () => {
    const call = await captureCall()
    expect(call.headers.get('x-forwarded-for')).toBeNull()
  })

  it('sends the analytics event id on every call when provided, and omits it otherwise', async () => {
    const calls: CapturedCall[] = []
    const { client } = createKobatoServerClient({
      url: 'https://kobato.internal/rpc',
      request: inboundRequest(),
      analyticsEventId: '4d2e6c1a-9f2b-4c3d-8e5f-1a2b3c4d5e6f',
      fetch: makeCapturingFetch(calls),
    })
    await client.public.content.bootstrap()
    await client.public.content.bootstrap()
    expect(calls).toHaveLength(2)
    for (const call of calls) {
      expect(call.headers.get('x-kobato-analytics-event')).toBe('4d2e6c1a-9f2b-4c3d-8e5f-1a2b3c4d5e6f')
    }

    const call = await captureCall()
    expect(call.headers.get('x-kobato-analytics-event')).toBeNull()
  })
})

describe('api/client/create-server-client — transport', () => {
  it('sends calls to the full RPC URL of the backend', async () => {
    const calls: CapturedCall[] = []
    const { client } = createKobatoServerClient({
      url: 'https://kobato.internal/rpc',
      request: inboundRequest(),
      fetch: makeCapturingFetch(calls),
    })

    await client.public.content.bootstrap()

    expect(calls[0]!.url).toBe('https://kobato.internal/rpc/public/content/bootstrap')
    expect(calls[0]!.method).toBe('POST')
  })

  it('collects every Set-Cookie across calls, in order, preserving multiplicity', async () => {
    const cookiesByCall = [
      ['__csrf=aaa; Path=/; HttpOnly', '__session=s1; Path=/; HttpOnly'],
      ['__csrf=bbb; Path=/; HttpOnly', '__csrf=bbb; Path=/; HttpOnly'],
    ]
    let callIndex = 0
    const { client, responseHeaders } = createKobatoServerClient({
      url: 'https://kobato.internal/rpc',
      request: inboundRequest(),
      fetch: async () => {
        const setCookies = cookiesByCall[callIndex] ?? []
        callIndex += 1
        return new Response(JSON.stringify({ json: null }), {
          status: 200,
          headers: [
            ['content-type', 'application/json'],
            ['x-unrelated', 'not-captured'],
            ...setCookies.map((cookie): [string, string] => ['set-cookie', cookie]),
          ],
        })
      },
    })

    await client.public.content.bootstrap()
    await client.public.content.bootstrap()

    expect(responseHeaders.getSetCookie()).toEqual([...cookiesByCall[0]!, ...cookiesByCall[1]!])
    expect(responseHeaders.get('x-unrelated')).toBeNull()
    expect([...responseHeaders.keys()].filter((key) => key !== 'set-cookie')).toEqual([])
  })

  it('reaches the public, account, and admin groups (type-level over the full contract)', () => {
    const { client } = createKobatoServerClient({
      url: 'https://kobato.internal/rpc',
      request: inboundRequest(),
      fetch: makeCapturingFetch([]),
    })

    expectTypeOf(client).toEqualTypeOf<ContractRouterClient<typeof apiContract>>()
    expectTypeOf(client.public.content.bootstrap).toBeFunction()
    expectTypeOf(client.account.auth.logout).toBeFunction()
    expectTypeOf(client.admin.users.list).toBeFunction()
  })
})

describe('api/client/create-server-client — abort signal composition', () => {
  function makeSignalCapture() {
    const signals: (AbortSignal | undefined)[] = []
    const fetch = async (
      _request: Request,
      init: { redirect?: RequestRedirect | undefined; signal?: AbortSignal },
    ): Promise<Response> => {
      signals.push(init.signal)
      return new Response(JSON.stringify({ json: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return { signals, fetch }
  }

  it('aborts the fetch signal when the inbound document request aborts', async () => {
    const inbound = new AbortController()
    const perCall = new AbortController()
    const { signals, fetch } = makeSignalCapture()
    const { client } = createKobatoServerClient({
      url: 'https://kobato.internal/rpc',
      request: new Request('https://sayaka.example/', { signal: inbound.signal }),
      fetch,
    })

    await client.public.content.bootstrap(undefined, { signal: perCall.signal })
    const signal = signals[0]
    expect(signal?.aborted).toBe(false)
    inbound.abort()
    expect(signal?.aborted).toBe(true)
  })

  it('aborts the fetch signal when the per-call signal aborts', async () => {
    const inbound = new AbortController()
    const perCall = new AbortController()
    const { signals, fetch } = makeSignalCapture()
    const { client } = createKobatoServerClient({
      url: 'https://kobato.internal/rpc',
      request: new Request('https://sayaka.example/', { signal: inbound.signal }),
      fetch,
    })

    await client.public.content.bootstrap(undefined, { signal: perCall.signal })
    const signal = signals[0]
    expect(signal?.aborted).toBe(false)
    perCall.abort()
    expect(signal?.aborted).toBe(true)
  })

  it('aborts the fetch signal when the inbound signal is already aborted', async () => {
    const inbound = new AbortController()
    inbound.abort()
    const { signals, fetch } = makeSignalCapture()
    const { client } = createKobatoServerClient({
      url: 'https://kobato.internal/rpc',
      request: new Request('https://sayaka.example/', { signal: inbound.signal }),
      fetch,
    })

    await client.public.content.bootstrap()
    expect(signals[0]?.aborted).toBe(true)
  })
})

describe('api/client/create-server-client — bounded request timeout', () => {
  it('cuts off a never-answering upstream after the configured timeout', async () => {
    const { client } = createKobatoServerClient({
      url: 'https://kobato.internal/rpc',
      request: inboundRequest(),
      requestTimeoutMs: 20,
      fetch: makeHangingFetch(),
    })

    const outcome = await client.public.content.bootstrap().then(
      () => 'answered',
      (error: unknown) => (error instanceof Error && error.name === 'TimeoutError' ? 'TimeoutError' : String(error)),
    )
    expect(outcome).toBe('TimeoutError')
  })

  it('lets the declared restore timeout win over a smaller factory default', async () => {
    const { client } = createKobatoServerClient({
      url: 'https://kobato.internal/rpc',
      request: inboundRequest(),
      requestTimeoutMs: 20,
      fetch: async () => {
        await flush(60)
        return new Response(JSON.stringify({ json: { accepted: true } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      },
    })

    await expect(
      client.admin.backup.uploadRestore({ file: new File(['kobato-backup'], 'backup.tar.gz') }),
    ).resolves.toEqual({ accepted: true })
  })

  it('releases the timeout once headers arrive so a streamed body is never cut', async () => {
    let drain!: () => void
    const gate = new Promise<void>((resolve) => {
      drain = resolve
    })
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('first'))
        void gate.then(() => {
          controller.enqueue(new TextEncoder().encode('second'))
          controller.close()
        })
      },
    })
    const hold = createKobatoServerClient({
      url: 'https://kobato.internal/rpc',
      request: inboundRequest(),
      requestTimeoutMs: 25,
      fetch: async () => {
        await flush(5)
        return new Response(body, {
          status: 200,
          headers: [
            [RESOURCE_STREAM_HEADER, '200'],
            ['content-type', 'font/woff2'],
          ],
        })
      },
    })

    await hold.client.public.fonts.embedded({ path: '/fonts/embedded/x' })
    await flush(60)
    drain()
    const captured = hold.takeResourceStream('public.fonts.embedded')
    expect(captured).not.toBeNull()
    const chunks: string[] = []
    for await (const chunk of captured!.body) {
      chunks.push(new TextDecoder().decode(chunk))
    }
    expect(chunks).toEqual(['first', 'second'])
  })
})

describe('api/client/create-server-client — resource stream capture', () => {
  function streamResponse(init: { status?: number; etag?: string; compressed?: boolean }): Response {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('first'))
        controller.enqueue(new TextEncoder().encode('second'))
        controller.close()
      },
    })
    return new Response(body, {
      status: init.status ?? 200,
      headers: [
        [RESOURCE_STREAM_HEADER, String(init.status ?? 200)],
        ['content-type', 'font/woff2'],
        ['cache-control', 'public, max-age=31536000, immutable'],
        ['accept-ranges', 'bytes'],
        ...(init.compressed === true
          ? ([
              ['content-encoding', 'gzip'],
              ['content-length', '28'],
            ] as [string, string][])
          : []),
        ...(init.etag === undefined ? [] : [['etag', init.etag] as [string, string]]),
        ['set-cookie', '__csrf=should-not-leak; Path=/'],
      ],
    })
  }

  async function callEmbedded(fetch: KobatoServerClientOptions['fetch']) {
    const hold = createKobatoServerClient({
      url: 'https://kobato.internal/rpc',
      request: inboundRequest(),
      fetch,
    })
    const output = await hold.client.public.fonts.embedded({ path: '/fonts/embedded/x' })
    return { hold, output }
  }

  it('captures a marker response as the resource stream and answers the call with a stub', async () => {
    const { hold, output } = await callEmbedded(async () => streamResponse({ status: 206, etag: '"7-100"' }))
    expect(output).toBeUndefined()
    const captured = hold.takeResourceStream('public.fonts.embedded')
    expect(captured).not.toBeNull()
    expect(captured!.status).toBe(206)
    expect(captured!.headers.get('content-type')).toBe('font/woff2')
    expect(captured!.headers.get('etag')).toBe('"7-100"')
    expect(captured!.headers.get(RESOURCE_STREAM_HEADER)).toBeNull()
    expect(captured!.headers.getSetCookie()).toEqual([])
    const chunks: string[] = []
    for await (const chunk of captured!.body) {
      chunks.push(new TextDecoder().decode(chunk))
    }
    expect(chunks).toEqual(['first', 'second'])
    expect(hold.takeResourceStream('public.fonts.embedded')).toBeNull()
  })

  it('never carries content-encoding or content-length in the captured headers', async () => {
    const { hold } = await callEmbedded(async () => streamResponse({ status: 200, etag: '"8-100"', compressed: true }))
    const captured = hold.takeResourceStream('public.fonts.embedded')
    expect(captured).not.toBeNull()
    expect(captured!.headers.get('content-encoding')).toBeNull()
    expect(captured!.headers.get('content-length')).toBeNull()
    expect(captured!.headers.get('content-type')).toBe('font/woff2')
    expect(captured!.headers.get('etag')).toBe('"8-100"')
    const chunks: string[] = []
    for await (const chunk of captured!.body) {
      chunks.push(new TextDecoder().decode(chunk))
    }
    expect(chunks).toEqual(['first', 'second'])
  })

  it('cancels the previous capture when the same procedure answers again', async () => {
    const bodies: ReadableStream<Uint8Array>[] = []
    const hold = createKobatoServerClient({
      url: 'https://kobato.internal/rpc',
      request: inboundRequest(),
      fetch: async () => {
        const response = streamResponse({})
        bodies.push(response.body!)
        return response
      },
    })
    await hold.client.public.fonts.embedded({ path: '/fonts/embedded/x' })
    await hold.client.public.fonts.embedded({ path: '/fonts/embedded/x' })
    expect(bodies).toHaveLength(2)
    const captured = hold.takeResourceStream('public.fonts.embedded')
    expect(captured!.body).toBe(bodies[1])
    await vi.waitFor(async () => {
      const reader = bodies[0]!.getReader()
      const outcome = await reader.read()
      expect(outcome.done).toBe(true)
    })
  })

  it('answers a plain envelope response without touching the capture', async () => {
    const { hold, output } = await callEmbedded(
      async () =>
        new Response(
          JSON.stringify({
            json: { kind: 'redirect', location: 'https://assets.example.com/x', cacheControl: 'public, max-age=300' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    )
    expect(output).toEqual({
      kind: 'redirect',
      location: 'https://assets.example.com/x',
      cacheControl: 'public, max-age=300',
    })
    expect(hold.takeResourceStream('public.fonts.embedded')).toBeNull()
  })

  it('keys captures by procedure path so parallel calls do not collide', async () => {
    const hold = createKobatoServerClient({
      url: 'https://kobato.internal/rpc',
      request: inboundRequest(),
      fetch: async (_request, _init, _options, path) => {
        const response = streamResponse({ status: 200 })
        void path
        return response
      },
    })
    const [fonts, storage] = await Promise.all([
      hold.client.public.fonts.embedded({ path: '/fonts/embedded/x' }),
      hold.client.public.storage.object({ path: '/storage/images/x.jpg' }),
    ])
    expect(fonts).toBeUndefined()
    expect(storage).toBeUndefined()
    expect(hold.takeResourceStream('public.fonts.embedded')).not.toBeNull()
    expect(hold.takeResourceStream('public.storage.object')).not.toBeNull()
    expect(hold.takeResourceStream('public.fonts.embedded')).toBeNull()
  })
})
