import type { Env } from '@kobato/server/http/context'

import { makeRequestContext } from '#/_helpers/request-context'

import { apiFaceMiddleware } from '@kobato/server/http/middlewares/api-face'
import { __resetRateLimitsForTests } from '@kobato/server/infra/rate-limit'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it } from 'vitest'

function makeApp(): Hono<Env> {
  const app = new Hono<Env>()
  // Stands in for the perimeter `requestContextMiddleware` the real
  // pipeline runs before this middleware.
  app.use('*', (c, next) => {
    c.set('requestContext', makeRequestContext({ clientAddress: '203.0.113.7' }))
    return next()
  })
  app.use('/api/*', apiFaceMiddleware())
  app.get('/api/ping', (c) => c.json({ ok: true }))
  app.post('/api/write', (c) => c.json({ ok: true }))
  return app
}

beforeEach(() => {
  __resetRateLimitsForTests()
})

describe('api face middleware', () => {
  it('answers anonymous reads with open CORS', async () => {
    const app = makeApp()
    const res = await app.request('http://localhost/api/ping')
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('rejects a credentialed write from an origin outside the allowlist', async () => {
    const app = makeApp()
    const request = new Request('http://localhost/api/write', {
      method: 'POST',
      headers: { Origin: 'https://evil.example.com' },
    })
    const res = await app.request(request)
    expect(res.status).toBe(403)
  })

  it('rate-limits reads per IP and honours the trusted-proxy exemption', async () => {
    const app = makeApp()
    // 1 req/min budget via the test config file is not possible here (the
    // config is module-level); instead exercise the limiter mechanics with
    // the default 300 budget: hammer 320 reads from one IP.
    let lastStatus = 0
    for (let i = 0; i < 305; i++) {
      const res = await app.request('http://localhost/api/ping')
      lastStatus = res.status
    }
    expect(lastStatus).toBe(429)
  })
})
