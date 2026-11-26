import type { apiContract } from '@kobato/api/contract'
import type { ContractRouterClient } from '@orpc/contract'

import { createKobatoServerClient } from '@kobato/api/client/create-server-client'
import { describe, expect, expectTypeOf, it } from 'vitest'

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
