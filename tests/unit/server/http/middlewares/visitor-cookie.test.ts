import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

import { isExempt } from '@/server/http/middlewares/visitor-cookie'

describe('isExempt', () => {
  it.each([
    // The real feed routes: exact `/feed` plus the `/feed/` sub-paths.
    ['/feed', true],
    ['/feed/atom', true],
    // Not feed routes — a bare `/feed` prefix used to exempt these, skipping
    // CSRF minting and turning the missing route into a 500 instead of a 404.
    ['/feed.xml', false],
    ['/feedfoo', false],
    // The cats/tags feed URLs never matched the prefix — behavior preserved.
    ['/cats/tech/feed', false],
    ['/cats/tech/feed/atom', false],
    ['/tags/tech/feed', false],
    // The other prefixes are unchanged.
    ['/__manifest', true],
    ['/assets/main.js', true],
    ['/build/chunk.js', true],
    ['/api/health', true],
    ['/sitemap.xml', true],
    ['/images/og/posts/hello.png', true],
    ['/', false],
    ['/posts/hello', false],
  ])('isExempt(%s) === %s', (pathname, expected) => {
    expect(isExempt(pathname)).toBe(expected)
  })
})

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
