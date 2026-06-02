import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

import type { Env } from '@/server/http/context'

import { requestTimeout } from '@/server/http/middlewares/request-timeout'

describe('requestTimeout', () => {
  it('allows fast requests through', async () => {
    const app = new Hono<Env>()
    app.use(requestTimeout(1000))
    app.get('/fast', (c) => c.json({ ok: true }))

    const res = await app.request('/fast')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
  })

  it('injects a combined signal into c.req.raw without Proxy', async () => {
    const app = new Hono<Env>()
    app.use(requestTimeout(1000))

    let capturedSignal: AbortSignal | undefined
    app.get('/capture', (c) => {
      capturedSignal = c.req.raw.signal
      return c.json({ ok: true })
    })

    const res = await app.request('/capture')
    expect(res.status).toBe(200)
    expect(capturedSignal).toBeDefined()
    expect(capturedSignal!.aborted).toBe(false)
  })

  it('cancels the combined signal when timeout fires', async () => {
    const app = new Hono<Env>()
    app.use(requestTimeout(50))

    let signalAborted = false
    app.get('/check', async (c) => {
      const signal = c.req.raw.signal
      signal.addEventListener('abort', () => {
        signalAborted = true
      })
      // Wait longer than the timeout so the abort has time to fire.
      await new Promise((r) => setTimeout(r, 150))
      return c.json({ aborted: signalAborted })
    })

    const res = await app.request('/check')
    expect(res.status).toBe(200)
    expect(signalAborted).toBe(true)
  })
})
