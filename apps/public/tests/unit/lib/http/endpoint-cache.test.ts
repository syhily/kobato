import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createEndpointCache } from '@/lib/http/endpoint-cache'

// The frontend's process-local short TTL cache for proxied feeds and the
// sitemap (`endpoint-cache.ts`). Three states are pinned here: a fresh
// entry serves without hitting the upstream, an expired entry refetches,
// and a non-200 upstream response is never cached. The 304 conditional
// branch (If-None-Match against the cached ETag) is pinned too.

afterEach(() => {
  vi.unstubAllGlobals()
})

function makeApp(ttlMs: number) {
  const upstream = vi.fn(async (c: { req: { url: string } }) => {
    const url = new URL(c.req.url)
    const etag = url.searchParams.get('etag') ?? 'abc'
    return new Response(`<feed key="${url.pathname + url.search}"/>`, {
      status: 200,
      headers: { 'Content-Type': 'application/xml', ETag: `"${etag}"`, 'Cache-Control': 'public, max-age=1800' },
    })
  })
  const app = new Hono()
  app.use('*', createEndpointCache({ ttlMs }))
  app.get('*', upstream)
  return { app, upstream }
}

describe('createEndpointCache', () => {
  it('serves repeat requests from the cache (single upstream hit)', async () => {
    const { app, upstream } = makeApp(60_000)

    const res1 = await app.request('/feed')
    const res2 = await app.request('/feed')

    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
    expect(await res1.text()).toBe('<feed key="/feed"/>')
    expect(await res2.text()).toBe('<feed key="/feed"/>')
    expect(upstream).toHaveBeenCalledTimes(1)
  })

  it('keys by the full URL — distinct queries are distinct entries', async () => {
    const { app, upstream } = makeApp(60_000)

    await app.request('/feed')
    await app.request('/feed?scope=1')
    await app.request('/feed')

    expect(upstream).toHaveBeenCalledTimes(2)
  })

  it('refetches once the entry expires', async () => {
    const { app, upstream } = makeApp(10)

    expect((await app.request('/feed')).status).toBe(200)
    // Let the 10 ms TTL lapse, then the next request must reach upstream again.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect((await app.request('/feed')).status).toBe(200)

    expect(upstream).toHaveBeenCalledTimes(2)
  })

  it('never caches a non-200 response', async () => {
    const app = new Hono()
    const upstream = vi.fn(async () => new Response('boom', { status: 503 }))
    app.use('*', createEndpointCache({ ttlMs: 60_000 }))
    app.get('*', upstream)

    expect((await app.request('/feed')).status).toBe(503)
    expect((await app.request('/feed')).status).toBe(503)

    expect(upstream).toHaveBeenCalledTimes(2)
  })

  it('answers 304 from the cache when If-None-Match matches the cached ETag', async () => {
    const { app, upstream } = makeApp(60_000)

    const first = await app.request('/feed')
    expect(first.headers.get('etag')).toBe('"abc"')

    const conditional = await app.request('/feed', { headers: { 'If-None-Match': '"abc"' } })

    expect(conditional.status).toBe(304)
    expect(conditional.headers.get('etag')).toBe('"abc"')
    expect(upstream).toHaveBeenCalledTimes(1)
  })

  it('serves HEAD requests from the cache with an empty body', async () => {
    const { app, upstream } = makeApp(60_000)

    expect((await app.request('/feed')).status).toBe(200)
    const head = await app.request('/feed', { method: 'HEAD' })

    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
    expect(upstream).toHaveBeenCalledTimes(1)
  })
})
