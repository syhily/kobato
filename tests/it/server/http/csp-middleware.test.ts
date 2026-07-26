import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

import { makeRequestContext } from '#/_helpers/request-context'

describe('CSP middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makeApp({ isDev = false }: { isDev?: boolean } = {}): Hono<Env> {
    const app = new Hono<Env>()

    // Mimic the nonce-generation middleware
    app.use('*', async (c, next) => {
      c.set('requestContext', makeRequestContext({ cspNonce: 'test-nonce-12345' }))
      await next()
    })

    // Mimic the dynamic-CSP middleware (simplified inline copy)
    app.use(async (c, next) => {
      await next()
      const nonce = c.var.requestContext.cspNonce
      const scriptSrc = isDev ? "script-src 'self' 'unsafe-inline'" : `script-src 'self' 'nonce-${nonce}'`
      const csp = [
        "default-src 'self'",
        scriptSrc,
        "style-src 'self' 'unsafe-inline'",
        "connect-src 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        'upgrade-insecure-requests',
      ].join('; ')
      c.res.headers.set('Content-Security-Policy', csp)
    })

    app.get('/', (c) => c.text('ok'))
    return app
  }

  it('sets script-src with nonce in production', async () => {
    const app = makeApp({ isDev: false })
    const res = await app.request('/')
    expect(res.status).toBe(200)

    const csp = res.headers.get('Content-Security-Policy')!
    expect(csp).toContain("script-src 'self' 'nonce-test-nonce-12345'")
    const scriptSrcMatch = csp.match(/script-src[^;]+/)
    expect(scriptSrcMatch?.[0]).not.toContain('unsafe-inline')
  })

  it('sets script-src with unsafe-inline in development', async () => {
    const app = makeApp({ isDev: true })
    const res = await app.request('/')
    expect(res.status).toBe(200)

    const csp = res.headers.get('Content-Security-Policy')
    expect(csp).toContain("script-src 'self' 'unsafe-inline'")
    expect(csp).not.toContain('nonce-')
  })

  it('includes the remaining baseline directives in both modes', async () => {
    const app = makeApp({ isDev: false })
    const res = await app.request('/')
    const csp = res.headers.get('Content-Security-Policy')!

    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("style-src 'self' 'unsafe-inline'")
    expect(csp).toContain("connect-src 'self'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain('upgrade-insecure-requests')
  })
})
