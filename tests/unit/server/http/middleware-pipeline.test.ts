import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

vi.mock('@/server/bootstrap/db-lifecycle', () => ({
  getDb: vi.fn(() => ({})),
  getPool: vi.fn(() => ({})),
}))

vi.mock('@/server/domains/auth/context', () => ({
  cspNonceContext: Symbol('cspNonce'),
  dbContext: Symbol('db'),
  poolContext: Symbol('pool'),
  requestContext: Symbol('request'),
  sessionContext: Symbol('session'),
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

vi.mock('@/server/http/middlewares/request-timeout', () => ({
  requestTimeout: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => next()),
}))

vi.mock('@/server/http/middlewares/session', () => ({
  buildRouteContexts: vi.fn(() => ({ session: {}, request: {} })),
  honoSessionMiddleware: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => next()),
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
const isRedisHealthy = vi.fn().mockReturnValue(true)
const pingRedis = vi.fn().mockResolvedValue(true)

vi.mock('@/server/infra/lifecycle', () => ({
  getServerPhase: () => getServerPhase(),
  getRestoreState: () => getRestoreState(),
  registerShutdownHook: vi.fn(),
}))

vi.mock('@/server/infra/logger', () => ({
  root: {},
  getLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}))

vi.mock('hono-pino', () => ({
  pinoLogger: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => next()),
}))

vi.mock('@/server/infra/logger/sanitizer', () => ({
  sanitizeReqHeaders: vi.fn((headers) => headers),
  resBindings: vi.fn(() => ({})),
}))

vi.mock('@/server/infra/redis/storage', () => ({
  isRedisHealthy: () => isRedisHealthy(),
  pingRedis: () => pingRedis(),
}))

const getBlogSettingsBundleSync = vi.fn().mockReturnValue(null)

vi.mock('@/shared/config/getters', () => ({
  getBlogSettingsBundleSync: () => getBlogSettingsBundleSync(),
}))

import { buildCspHeader, configureMiddleware, buildLoadContext } from '@/server/http/middleware-pipeline'

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

  it('adds font and asset origins from the bundle', () => {
    const header = buildCspHeader({
      bundle: {
        fonts: { globalCss: ['https://fonts.example.com/font.css'], postCss: ['bad-url'] },
        assets: { asset: { host: 'cdn.example.com' } },
      } as never,
      nonce: 'abc123',
      isDev: false,
    })
    expect(header).toContain('https://fonts.example.com')
    expect(header).toContain('https://cdn.example.com')
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
    const context = await buildLoadContext({
      var: { cspNonce: 'nonce' } as Env['Variables'],
      req: { raw: new Request('http://localhost/'), url: 'http://localhost/' },
    })
    expect(context).toBeDefined()
  })
})
