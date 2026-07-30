import type { Hono } from 'hono'

import { describe, expect, it } from 'vitest'

import { wrapFetchWithLeakedResponseHandler } from '@/server/http/leaked-response'

interface FakeApp {
  fetch: (req: Request | string) => Response | Promise<Response>
}

function makeApp(fetchImpl: FakeApp['fetch']): FakeApp {
  return { fetch: fetchImpl }
}

describe('server/http/leaked-response — wrapFetchWithLeakedResponseHandler', () => {
  it('returns the original response when fetch succeeds', async () => {
    const ok = new Response('hi', { status: 200 })
    const app = makeApp(() => ok)
    wrapFetchWithLeakedResponseHandler(app as unknown as Hono)
    const res = await app.fetch(new Request('https://example.com'))
    expect(res).toBe(ok)
  })

  it('swallows a leaked Response thrown synchronously and returns it', async () => {
    const leaked = new Response(null, { status: 302, headers: { Location: '/login' } })
    const app = makeApp(() => {
      throw leaked
    })
    wrapFetchWithLeakedResponseHandler(app as unknown as Hono)
    const res = await app.fetch(new Request('https://example.com'))
    expect(res).toBe(leaked)
  })

  it('swallows a leaked Response rejected from an async fetch', async () => {
    const leaked = new Response(null, { status: 401 })
    const app = makeApp(async () => {
      throw leaked
    })
    wrapFetchWithLeakedResponseHandler(app as unknown as Hono)
    const res = await app.fetch(new Request('https://example.com'))
    expect(res).toBe(leaked)
  })

  it('rethrows non-Response sync errors', () => {
    const app = makeApp(() => {
      throw new Error('boom')
    })
    wrapFetchWithLeakedResponseHandler(app as unknown as Hono)
    expect(() => app.fetch(new Request('https://example.com'))).toThrow('boom')
  })

  it('rethrows non-Response async errors', async () => {
    const app = makeApp(async () => {
      throw new Error('async boom')
    })
    wrapFetchWithLeakedResponseHandler(app as unknown as Hono)
    await expect(app.fetch(new Request('https://example.com'))).rejects.toThrow('async boom')
  })
})
