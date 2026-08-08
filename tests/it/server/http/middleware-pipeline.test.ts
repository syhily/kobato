import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

import { resetBlogSettingsForTests } from '#/_helpers/blog-settings'
import { getTestDb } from '#/_helpers/integration-db'
import { makeRequestContext } from '#/_helpers/request-context'
import { emptySession } from '#/_helpers/session'

// The seven perimeter middlewares run for real against the it harness;
// seams: `createApiApp`, the resource routers, and the logging trio.

vi.mock('@/server/http/app', () => ({
  createApiApp: vi.fn(() => new Hono()),
}))

vi.mock('@/server/http/resources/analytics', () => ({
  analyticsEventsRouter: new Hono(),
}))

vi.mock('@/server/http/resources/assets', () => ({
  assetsRouter: new Hono(),
}))

vi.mock('@/server/http/resources/backup', () => ({
  backupRouter: new Hono(),
}))

vi.mock('@/server/http/resources/branding', () => ({
  brandingRouter: new Hono(),
}))

vi.mock('@/server/http/resources/feed', () => ({
  feedRouter: new Hono(),
}))

vi.mock('@/server/http/resources/fonts', () => ({
  fontsRouter: new Hono(),
}))

vi.mock('@/server/http/resources/fonts-package', () => ({
  fontsPackageRouter: new Hono(),
}))

vi.mock('@/server/http/resources/images', () => ({
  imagesRouter: new Hono(),
}))

vi.mock('@/server/http/resources/maxmind', () => ({
  maxmindRouter: new Hono(),
}))

vi.mock('@/server/http/resources/music-proxy', () => ({
  musicProxyRouter: new Hono(),
}))

vi.mock('@/server/http/resources/redirects', () => ({
  redirectsRouter: new Hono(),
}))

vi.mock('@/server/http/resources/sitemap', () => ({
  sitemapRouter: new Hono(),
}))

vi.mock('@/server/infra/logger', () => ({
  root: {},
  getLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
  L3_KEYS: new Set<string>(),
}))

vi.mock('hono-pino', () => ({
  pinoLogger: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => next()),
}))

vi.mock('@/server/infra/logger/sanitizer', () => ({
  sanitizeReqHeaders: vi.fn((headers) => headers),
  resBindings: vi.fn(() => ({})),
}))

import { buildCspHeader, configureMiddleware, buildLoadContext } from '@/server/http/middleware-pipeline'
import { requestContext } from '@/server/http/request-context'
import { session as sessionTable } from '@/server/infra/db/schema/session'

describe('buildCspHeader', () => {
  it('returns a strict nonce-based policy in production', () => {
    const header = buildCspHeader({ bundle: null, nonce: 'abc123', isDev: false })
    expect(header).toContain("script-src 'self' 'nonce-abc123'")
    expect(header).toContain("worker-src 'self'")
  })

  it('relaxes script-src in development', () => {
    const header = buildCspHeader({ bundle: null, nonce: 'abc123', isDev: true })
    expect(header).toContain("script-src 'self' 'unsafe-inline'")
    expect(header).toContain("worker-src 'self' blob:")
  })

  it('adds the asset host from the bundle (self-hosted fonts need no per-font origin)', () => {
    const header = buildCspHeader({
      bundle: {
        // Font slots carry id lists, not external CSS URLs — no per-font origin is ever injected.
        fonts: { global: [], post: [], code: [] },
        assets: { asset: { host: 'cdn.example.com' } },
      } as never,
      nonce: 'abc123',
      isDev: false,
    })
    expect(header).toContain('https://cdn.example.com')
    // Self-hosted packages stay CSP-safe: 'self' or the asset host — no external origin.
    expect(header).not.toContain('fonts.example.com')
  })
})

describe('configureMiddleware', () => {
  it('registers health, ready and asset-guard routes', () => {
    const app = new Hono<Env>()
    configureMiddleware(app)
    const paths = app.routes.map((r) => r.path)
    expect(paths).toContain('/health')
    expect(paths).toContain('/ready')
    expect(paths).toContain('/assets/*')
  })
})

describe('dynamic CSP middleware', () => {
  it('keeps the static secureHeaders CSP when the real WP decoy short-circuits before the RequestContext is derived', async () => {
    const app = new Hono<Env>()
    configureMiddleware(app)
    // wp-decoy 404s before requestContextMiddleware — the overwrite must skip on undefined context.
    const res = await app.request('/wp-login.php')
    expect(res.status).toBe(404)
    const csp = res.headers.get('Content-Security-Policy')
    expect(csp).toContain("default-src 'self'")
    // Marker only present in the dynamic policy from buildCspHeader.
    expect(csp).not.toContain("base-uri 'self'")
  })

  it('overwrites with the dynamic policy once the real request-context middleware derived a RequestContext', async () => {
    const app = new Hono<Env>()
    configureMiddleware(app)
    // /health reaches requestContextMiddleware (harness db), so the dynamic overwrite fires.
    const res = await app.request('/health')
    const csp = res.headers.get('Content-Security-Policy')
    expect(csp).toContain("base-uri 'self'")
  })
})

describe('readiness probe', () => {
  it('reports 503 with the real phase — the it harness never leaves booting', async () => {
    const app = new Hono<Env>()
    configureMiddleware(app)
    // The harness never leaves booting — `setServerPhase('running')` is production-bootstrap only.
    const res = await app.request('/ready')
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ status: 'booting' })
  })
})

describe('anonymous session writes (P1-4)', () => {
  it('cookieless GET writes no session row and sets no __session cookie', async () => {
    const app = new Hono<Env>()
    configureMiddleware(app)
    const db = getTestDb()
    // Bot-flood GETs must not persist a session row just to carry a CSRF token.
    const rowsBefore = await db.select({ id: sessionTable.id }).from(sessionTable)
    const res = await app.request('/health')
    const rowsAfter = await db.select({ id: sessionTable.id }).from(sessionTable)
    expect(rowsAfter.length).toBe(rowsBefore.length)

    const setCookies = res.headers.getSetCookie()
    expect(setCookies.some((v) => v.startsWith('__session='))).toBe(false)
    // The stateless double-submit cookie still covers SSR forms and /rpc mutations.
    expect(setCookies.some((v) => v.startsWith('__csrf='))).toBe(true)
  })

  it('cookieless POST writes no session row and mints no cookies', async () => {
    const app = new Hono<Env>()
    configureMiddleware(app)
    const db = getTestDb()
    const rowsBefore = await db.select({ id: sessionTable.id }).from(sessionTable)
    const res = await app.request('/health', { method: 'POST' })
    const rowsAfter = await db.select({ id: sessionTable.id }).from(sessionTable)
    expect(rowsAfter.length).toBe(rowsBefore.length)

    const setCookies = res.headers.getSetCookie()
    expect(setCookies.some((v) => v.startsWith('__session='))).toBe(false)
    expect(setCookies.some((v) => v.startsWith('__csrf='))).toBe(false)
  })
})

describe('buildLoadContext', () => {
  it('hydrates settings against the real database and returns a RouterContextProvider', async () => {
    // Reset the worker's seeded bundle so the real hydrate reads the (empty) setting table.
    resetBlogSettingsForTests()
    const rc = makeRequestContext({ session: emptySession(), cspNonce: 'nonce', db: getTestDb() })
    const context = await buildLoadContext({
      var: { requestContext: rc } as unknown as Env['Variables'],
      req: { raw: new Request('http://localhost/'), url: 'http://localhost/' },
    })
    expect(context).toBeDefined()
    expect(context.get(requestContext)).toBe(rc)
  })
})
