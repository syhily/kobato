import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

import { resetBlogSettingsForTests } from '#/_helpers/blog-settings'
import { getTestDb } from '#/_helpers/integration-db'
import { makeRequestContext } from '#/_helpers/request-context'
import { emptySession } from '#/_helpers/session'

vi.mock('@/server/http/app', () => ({
  createApiApp: vi.fn(() => new Hono()),
}))

vi.mock('@/server/http/errors', () => ({
  onErrorHandler: vi.fn(),
}))

vi.mock('@/server/http/middlewares/cors', () => ({
  corsMiddleware: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => next()),
}))

vi.mock('@/server/http/middlewares/install-gate', () => ({
  // Mounted directly (`app.use(honoInstallGateMiddleware)`) — the mock must
  // BE the pass-through middleware, not a factory returning one.
  honoInstallGateMiddleware: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
}))

vi.mock('@/server/http/middlewares/request-context', () => ({
  // Mounted directly (`app.use(requestContextMiddleware)`) — see above.
  requestContextMiddleware: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
}))

vi.mock('@/server/http/middlewares/request-timeout', () => ({
  requestTimeout: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => next()),
}))

vi.mock('@/server/http/middlewares/trailing-slash', () => ({
  // Mounted directly (`app.use(trailingSlashNormaliser)`) — see above.
  trailingSlashNormaliser: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
}))

vi.mock('@/server/http/middlewares/visitor-cookie', () => ({
  // Mounted directly (`app.use(honoVisitorCookieMiddleware)`) — see above.
  honoVisitorCookieMiddleware: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
}))

vi.mock('@/server/http/middlewares/wp-decoy', () => ({
  // Mounted directly (`app.use(honoWpDecoyMiddleware)`) — see above.
  honoWpDecoyMiddleware: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
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

const getServerPhase = vi.fn().mockReturnValue('running')

vi.mock('@/server/infra/lifecycle', async (importOriginal) => {
  // The real db-lifecycle (initialized by the it harness) wires itself
  // against this module — keep every export and pin only the phase.
  const actual = await importOriginal<typeof import('@/server/infra/lifecycle')>()
  return {
    ...actual,
    getServerPhase: () => getServerPhase(),
  }
})

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
  it('keeps the static secureHeaders CSP when no RequestContext was derived (early short-circuit)', async () => {
    const app = new Hono<Env>()
    configureMiddleware(app)
    // The mocked requestContextMiddleware never sets c.var.requestContext,
    // which is exactly the state early short-circuits registered before it
    // (trailing-slash 301 redirect, WP decoy 404) leave behind — the dynamic
    // CSP overwrite must skip instead of crashing on the missing nonce.
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    const csp = res.headers.get('Content-Security-Policy')
    expect(csp).toContain("default-src 'self'")
    // Marker only present in the dynamic policy from buildCspHeader.
    expect(csp).not.toContain("base-uri 'self'")
  })

  it('overwrites with the dynamic policy when the RequestContext exists', async () => {
    const app = new Hono<Env>()
    configureMiddleware(app)
    app.use((c, next) => {
      c.set('requestContext', makeRequestContext({ session: emptySession(), cspNonce: 'test-nonce-xyz' }))
      return next()
    })
    const res = await app.request('/any-path')
    const csp = res.headers.get('Content-Security-Policy')
    expect(csp).toContain("base-uri 'self'")
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
