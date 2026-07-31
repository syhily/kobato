import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

import { resetBlogSettingsForTests } from '#/_helpers/blog-settings'
import { getTestDb } from '#/_helpers/integration-db'
import { makeRequestContext } from '#/_helpers/request-context'
import { emptySession } from '#/_helpers/session'

// All seven perimeter middlewares (cors / install-gate / request-context /
// request-timeout / trailing-slash / visitor-cookie / wp-decoy) run for REAL
// against the it harness: `requestContextMiddleware` derives from the
// harness-initialized db-lifecycle, `install-gate` reads the real install
// state (`hasAdmin` against the empty user table), and the remaining four
// are pure per-request functions. The kept seams are the composition root
// (`createApiApp`), the resource routers (their own suites cover them),
// and the logging trio (log noise).

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
        // The fonts section now carries slot id lists (global/post/code),
        // not external CSS URLs — no per-font origin is ever injected.
        fonts: { global: [], post: [], code: [] },
        assets: { asset: { host: 'cdn.example.com' } },
      } as never,
      nonce: 'abc123',
      isDev: false,
    })
    expect(header).toContain('https://cdn.example.com')
    // No external font origin leaks in — self-hosted packages are served
    // from 'self' (local) or the asset host above (S3), both CSP-safe.
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
    // The REAL pipeline: the wp-decoy middleware answers /wp-login.php with
    // a 404 before `requestContextMiddleware` ever runs, so
    // `c.var.requestContext` is undefined — the dynamic overwrite must skip
    // and leave the static CSP from `secureHeaders` in place (the
    // middleware-pipeline.ts:112-115 regression scenario).
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
    // /health survives the wp-decoy and trailing-slash passes, so the real
    // `requestContextMiddleware` derives a RequestContext (harness db) and
    // the dynamic overwrite fires. The real install gate then redirects
    // pre-install (no admin row) — irrelevant to the header assertion.
    const res = await app.request('/health')
    const csp = res.headers.get('Content-Security-Policy')
    expect(csp).toContain("base-uri 'self'")
  })
})

describe('readiness probe', () => {
  it('reports 503 with the real phase — the it harness never leaves booting', async () => {
    const app = new Hono<Env>()
    configureMiddleware(app)
    // No phase mock: `setServerPhase('running')` is only called by the
    // production bootstrap / restart flow, never by the db-lifecycle the
    // it harness initializes. `/ready` is exempt from the real install
    // gate, so the real `readyHandler` projects the booting phase.
    const res = await app.request('/ready')
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ status: 'booting' })
  })
})

describe('buildLoadContext', () => {
  it('hydrates settings against the real database and returns a RouterContextProvider', async () => {
    // The hydration is REAL — the it harness's db-lifecycle is already
    // initialized. Reset the worker's seeded bundle so the hydrate
    // actually reads the (empty) setting table.
    resetBlogSettingsForTests()
    const rc = makeRequestContext({ session: emptySession(), cspNonce: 'nonce', db: getTestDb() })
    const context = await buildLoadContext({
      var: { requestContext: rc } as unknown as Env['Variables'],
      req: { raw: new Request('http://localhost/'), url: 'http://localhost/' },
    })
    expect(context).toBeDefined()
    // The single canonical key carries the Hono-side RequestContext as-is.
    expect(context.get(requestContext)).toBe(rc)
  })
})
