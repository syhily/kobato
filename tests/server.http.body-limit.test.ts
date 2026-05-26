import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

import type { Env } from '@/server/http/context'

import { dynamicBodyLimit } from '@/server/http/middlewares/dynamic-body-limit'

describe('dynamicBodyLimit', () => {
  function makeApp(maxSize: number | (() => number), onError?: (c: any) => Response) {
    const app = new Hono<Env>()
    app.use(dynamicBodyLimit({ maxSize, onError }))
    app.post('/test', (c) => c.json({ ok: true }))
    app.get('/test', (c) => c.json({ ok: true }))
    return app
  }

  it('allows GET requests without body', async () => {
    const app = makeApp(100)
    const res = await app.request('/test', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
  })

  it('allows POST with content-length within limit', async () => {
    const app = makeApp(100)
    const res = await app.request('/test', {
      method: 'POST',
      body: 'x'.repeat(50),
      headers: { 'content-length': '50' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
  })

  it('rejects POST with content-length exceeding limit', async () => {
    const app = makeApp(100)
    const res = await app.request('/test', {
      method: 'POST',
      body: 'x'.repeat(200),
      headers: { 'content-length': '200' },
    })
    expect(res.status).toBe(413)
    expect(await res.text()).toBe('Payload Too Large')
  })

  it('allows stream body within limit', async () => {
    const app = makeApp(100)
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(50)))
        controller.close()
      },
    })
    const res = await app.request('/test', {
      method: 'POST',
      body: stream,
      // @ts-expect-error — Node.js fetch requires duplex when sending a stream body
      duplex: 'half',
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
  })

  it('rejects stream body exceeding limit', async () => {
    const app = makeApp(100)
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(200)))
        controller.close()
      },
    })
    const res = await app.request('/test', {
      method: 'POST',
      body: stream,
      // @ts-expect-error — Node.js fetch requires duplex when sending a stream body
      duplex: 'half',
    })
    expect(res.status).toBe(413)
  })

  it('uses dynamic maxSize on each request', async () => {
    let maxSize = 50
    const app = makeApp(() => maxSize)

    const res1 = await app.request('/test', {
      method: 'POST',
      body: 'x'.repeat(100),
      headers: { 'content-length': '100' },
    })
    expect(res1.status).toBe(413)

    maxSize = 200
    const res2 = await app.request('/test', {
      method: 'POST',
      body: 'x'.repeat(100),
      headers: { 'content-length': '100' },
    })
    expect(res2.status).toBe(200)
    const body = (await res2.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
  })

  it('uses custom onError handler', async () => {
    const app = makeApp(10, (c) => c.text('custom error', 413))
    const res = await app.request('/test', {
      method: 'POST',
      body: 'x'.repeat(100),
      headers: { 'content-length': '100' },
    })
    expect(res.status).toBe(413)
    expect(await res.text()).toBe('custom error')
  })
})
