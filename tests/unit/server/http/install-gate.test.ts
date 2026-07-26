import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

import { normalizeDocumentUrl } from '@/server/http/utils/request-facts'

// prettier-ignore
const EXEMPT_CASES = [
  // static asset prefixes
  { path: '/assets/main.js',         desc: 'assets prefix' },
  { path: '/build/client.js',        desc: 'build prefix' },
  { path: '/fonts/Inter.woff2',      desc: 'fonts prefix' },
  { path: '/images/avatar/1.png',    desc: 'images prefix' },
  // favicon variants
  { path: '/favicon.svg',            desc: 'favicon svg' },
  { path: '/favicon.ico',            desc: 'favicon ico' },
  // logo variants
  { path: '/logo.svg',               desc: 'logo svg' },
  { path: '/logo-dark.svg',          desc: 'logo-dark svg' },
  { path: '/logo-large.svg',         desc: 'logo-large svg' },
  { path: '/logo-large-dark.svg',    desc: 'logo-large-dark svg' },
  // apple touch icon
  { path: '/apple-touch-icon.png',   desc: 'apple-touch-icon' },
  // other well-known files
  { path: '/robots.txt',             desc: 'robots.txt' },
  { path: '/sitemap.xml',            desc: 'sitemap.xml' },
  { path: '/__manifest',             desc: '__manifest' },
  // install-gate explicit paths
  { path: '/admin/signin',           desc: 'admin signin' },
  { path: '/admin/setup',            desc: 'admin setup' },
  { path: '/api/setup/restore',      desc: 'api setup restore' },
  { path: '/ready',                  desc: 'ready endpoint' },
  // React Router data suffix
  { path: '/admin/signin.data',      desc: 'RR data suffix' },
]

// prettier-ignore
const BLOCKED_CASES = [
  { path: '/',                       desc: 'root path' },
  { path: '/posts/hello',            desc: 'public post' },
  { path: '/about',                  desc: 'page route' },
]

describe('honoInstallGateMiddleware', () => {
  async function makeApp() {
    const { honoInstallGateMiddleware } = await import('@/server/http/middlewares/install-gate')
    const app = new Hono<Env>()
    // Stub the canonical per-request context — the gate reads
    // `requestContext.url` (already normalized upstream: `.data` stripped)
    // and `requestContext.db`.
    app.use('*', async (c, next) => {
      c.set('requestContext', {
        url: normalizeDocumentUrl(new URL(c.req.url)),
        db: {},
      } as unknown as Env['Variables']['requestContext'])
      await next()
    })
    app.use(honoInstallGateMiddleware)
    app.all('*', (c) => c.json({ ok: true }))
    return app
  }

  describe('exempt paths (noAdmin → passes through)', () => {
    for (const { path, desc } of EXEMPT_CASES) {
      it(`allows ${desc}: ${path}`, async () => {
        vi.doMock('@/server/infra/db/operations/user', () => ({
          hasAdmin: vi.fn().mockResolvedValue(false),
        }))
        try {
          const app = await makeApp()
          const res = await app.request(path)
          // Either 200 (passed through) or 303 (allowed by explicit exempt)
          expect(res.status).not.toBe(302)
          expect(res.headers.get('location')).not.toBe('/admin/setup')
        } finally {
          vi.doUnmock('@/server/infra/db/operations/user')
        }
      })
    }
  })

  describe('blocked paths (noAdmin → redirect)', () => {
    for (const { path, desc } of BLOCKED_CASES) {
      it(`redirects ${desc}: ${path}`, async () => {
        vi.doMock('@/server/infra/db/operations/user', () => ({
          hasAdmin: vi.fn().mockResolvedValue(false),
        }))
        try {
          const app = await makeApp()
          const res = await app.request(path)
          expect(res.status).toBe(303)
          expect(res.headers.get('location')).toBe('/admin/setup')
        } finally {
          vi.doUnmock('@/server/infra/db/operations/user')
        }
      })
    }
  })

  describe('installed state', () => {
    it('allows all paths when installed', async () => {
      vi.doMock('@/server/infra/db/operations/user', () => ({
        hasAdmin: vi.fn().mockResolvedValue(true),
      }))
      vi.resetModules()
      try {
        const app = await makeApp()
        const res = await app.request('/posts/hello')
        expect(res.status).toBe(200)
      } finally {
        vi.doUnmock('@/server/infra/db/operations/user')
      }
    })
  })
})
