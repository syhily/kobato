import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

import { makeRequestContext } from '#/_helpers/request-context'
import { emptySession } from '#/_helpers/session'

vi.mock('@/server/bootstrap/db-lifecycle', () => ({
  getDb: vi.fn(() => ({})),
  getPool: vi.fn(() => ({})),
}))

vi.mock('@/server/domains/settings/services/hydrate', () => ({
  hydrateBlogSettings: vi.fn().mockResolvedValue(undefined),
}))

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
  honoInstallGateMiddleware: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => next()),
}))

vi.mock('@/server/http/middlewares/request-context', () => ({
  requestContextMiddleware: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => next()),
}))

vi.mock('@/server/http/middlewares/request-timeout', () => ({
  requestTimeout: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => next()),
}))

vi.mock('@/server/http/middlewares/trailing-slash', () => ({
  trailingSlashNormaliser: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => next()),
}))

vi.mock('@/server/http/middlewares/visitor-cookie', () => ({
  honoVisitorCookieMiddleware: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => next()),
}))

vi.mock('@/server/http/middlewares/wp-decoy', () => ({
  honoWpDecoyMiddleware: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => next()),
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
const getRestoreState = vi.fn().mockReturnValue(null)

vi.mock('@/server/infra/lifecycle', () => ({
  getServerPhase: () => getServerPhase(),
  getRestoreState: () => getRestoreState(),
  registerShutdownHook: vi.fn(),
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

const getBlogSettingsBundleSync = vi.fn().mockReturnValue(null)

vi.mock('@/shared/config/getters', () => ({
  getBlogSettingsBundleSync: () => getBlogSettingsBundleSync(),
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

describe('buildLoadContext', () => {
  it('hydrates settings and returns a RouterContextProvider', async () => {
    const rc = makeRequestContext({ session: emptySession(), cspNonce: 'nonce' })
    const context = await buildLoadContext({
      var: { requestContext: rc } as unknown as Env['Variables'],
      req: { raw: new Request('http://localhost/'), url: 'http://localhost/' },
    })
    expect(context).toBeDefined()
    // The single canonical key carries the Hono-side RequestContext as-is.
    expect(context.get(requestContext)).toBe(rc)
  })
})
