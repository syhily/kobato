import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

describe('honoVisitorCookieMiddleware', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  async function buildApp(visitorMock: { setCookie?: string | null } = {}) {
    vi.doMock('@/server/domains/analytics/visitor-cookie', () => ({
      resolveVisitorCookie: vi.fn().mockReturnValue(visitorMock),
    }))

    const { honoVisitorCookieMiddleware } = await import('@/server/http/middlewares/visitor-cookie')
    const app = new Hono<Env>()
    app.use(honoVisitorCookieMiddleware)
    app.all('*', (c) => c.text('ok'))
    return app
  }

  it('sets visitor cookie for non-exempt paths', async () => {
    const app = await buildApp({ setCookie: 'visitor=abc; Path=/; HttpOnly' })
    const res = await app.request('/')
    expect(res.status).toBe(200)
    expect(res.headers.get('Set-Cookie')).toBe('visitor=abc; Path=/; HttpOnly')
  })

  it('skips cookie for exempt asset paths', async () => {
    const app = await buildApp({ setCookie: 'visitor=abc; Path=/; HttpOnly' })
    const res = await app.request('/assets/main.js')
    expect(res.status).toBe(200)
    expect(res.headers.get('Set-Cookie')).toBeNull()
  })

  it('skips cookie for exempt api paths', async () => {
    const app = await buildApp({ setCookie: 'visitor=abc; Path=/; HttpOnly' })
    const res = await app.request('/api/health')
    expect(res.status).toBe(200)
    expect(res.headers.get('Set-Cookie')).toBeNull()
  })

  it('skips cookie when resolver returns no setCookie', async () => {
    const app = await buildApp({ setCookie: null })
    const res = await app.request('/')
    expect(res.status).toBe(200)
    expect(res.headers.get('Set-Cookie')).toBeNull()
  })
})
