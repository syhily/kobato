import type { Env } from '@kobato/server/http/hono-env'

import { requestTimeout } from '@kobato/server/http/middlewares/request-timeout'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

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

  it('cancels the combined signal when timeout fires', { timeout: 30_000 }, async () => {
    // [DEBUG-k9x2] temporary CI stall probe — heartbeat every 100ms; gaps in
    // the printed timestamps during a freeze show whether this worker's
    // event loop stalled and for how long. Revert with the probe commit.
    const t0 = performance.now()
    const heart = setInterval(() => {
      console.log(`[DEBUG-k9x2] beat +${(performance.now() - t0).toFixed(0)}ms`)
    }, 100)
    try {
      const app = new Hono<Env>()
      app.use(requestTimeout(50))

      let signalAborted = false
      app.get('/check', async (c) => {
        console.log(`[DEBUG-k9x2] handler entered +${(performance.now() - t0).toFixed(0)}ms`)
        const signal = c.req.raw.signal
        // Resolve on the abort itself instead of sleeping past the timeout —
        // a fixed wall-clock sleep is the first casualty when CI's 4 cores
        // stall under the full suite (observed as a 10s TestTimeoutError with
        // the sibling tests green); the generous per-test timeout rides out
        // the same stall.
        await new Promise<void>((resolve) => {
          const onAbort = () => {
            signalAborted = true
            resolve()
          }
          signal.addEventListener('abort', onAbort, { once: true })
          // Middleware regression (abort never fires) resolves at 5s with
          // signalAborted still false → clean assertion failure, not a hang.
          setTimeout(resolve, 5_000)
        })
        return c.json({ aborted: signalAborted })
      })

      const res = await app.request('/check')
      console.log(`[DEBUG-k9x2] response +${(performance.now() - t0).toFixed(0)}ms`)
      expect(res.status).toBe(200)
      expect(signalAborted).toBe(true)
    } finally {
      clearInterval(heart)
    }
  })
})
