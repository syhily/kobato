import type { Env } from '@kobato/server/http/hono-env.ts'

import {
  resetBlogSettingsForTests,
  setBlogSettingsBundleForTests,
  TEST_BLOG_SETTINGS_BUNDLE,
} from '@kobato/server/tests/utils/blog-settings.ts'
import { getTestDb } from '@kobato/server/tests/utils/integration-db.ts'
import { makeRequestContext } from '@kobato/server/tests/utils/request-context.ts'
import { emptySession } from '@kobato/server/tests/utils/session.ts'
import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@kobato/server/http/app.ts', () => ({
  createApiApp: vi.fn(() => new Hono()),
}))

vi.mock('@kobato/server/http/resources/analytics.ts', () => ({
  analyticsEventsRouter: new Hono(),
}))

vi.mock('@kobato/server/http/resources/assets.ts', () => ({
  assetsRouter: new Hono(),
}))

vi.mock('@kobato/server/http/resources/backup.ts', () => ({
  backupRouter: new Hono(),
}))

vi.mock('@kobato/server/http/resources/branding.ts', () => ({
  brandingRouter: new Hono(),
}))

vi.mock('@kobato/server/http/resources/feed.ts', () => ({
  feedRouter: new Hono(),
}))

vi.mock('@kobato/server/http/resources/fonts.ts', () => ({
  fontsRouter: new Hono(),
}))

vi.mock('@kobato/server/http/resources/fonts-package.ts', () => ({
  fontsPackageRouter: new Hono(),
}))

vi.mock('@kobato/server/http/resources/images.ts', () => ({
  imagesRouter: new Hono(),
}))

vi.mock('@kobato/server/http/resources/maxmind.ts', () => ({
  maxmindRouter: new Hono(),
}))

vi.mock('@kobato/server/http/resources/music-proxy.ts', () => ({
  musicProxyRouter: new Hono(),
}))

vi.mock('@kobato/server/http/resources/redirects.ts', () => ({
  redirectsRouter: new Hono(),
}))

vi.mock('@kobato/server/http/resources/sitemap.ts', () => ({
  sitemapRouter: new Hono(),
}))

vi.mock('@kobato/server/infra/logger.ts', () => ({
  root: {},
  getLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
  L3_KEYS: new Set<string>(),
}))

vi.mock('hono-pino', () => ({
  pinoLogger: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => next()),
}))

vi.mock('@kobato/server/infra/logger/sanitizer.ts', () => ({
  sanitizeReqHeaders: vi.fn((headers) => headers),
  resBindings: vi.fn(() => ({})),
}))

import { session as sessionTable } from '@kobato/db/schema/session.ts'
import { buildCspHeader, configureMiddleware, buildLoadContext } from '@kobato/server/http/middleware-pipeline.ts'
import { requestContext } from '@kobato/server/http/request-context.ts'

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
        fonts: { global: [], post: [], code: [] },
        assets: { asset: { host: 'cdn.example.com' } },
      } as never,
      nonce: 'abc123',
      isDev: false,
    })
    expect(header).toContain('https://cdn.example.com')
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

describe('RUM status mount', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('mounts the resource router in every build (the gate lives in the handler)', () => {
    for (const dev of [true, false]) {
      vi.stubEnv('DEV', dev)
      const app = new Hono<Env>()
      configureMiddleware(app)
      const paths = app.routes.map((route) => route.path)
      expect(paths).toContain('/api/rum/status')
      expect(paths).toContain('/api/rum/intake/*')
      expect(paths).not.toContain('/api/dev/rum/status')
    }
  })
})

describe('dynamic CSP middleware', () => {
  it('keeps the static secureHeaders CSP when the real WP decoy short-circuits before the RequestContext is derived', async () => {
    const app = new Hono<Env>()
    configureMiddleware(app)
    const res = await app.request('/wp-login.php')
    expect(res.status).toBe(404)
    const csp = res.headers.get('Content-Security-Policy')
    expect(csp).toContain("default-src 'self'")
    expect(csp).not.toContain("base-uri 'self'")
  })

  it('overwrites with the dynamic policy once the real request-context middleware derived a RequestContext', async () => {
    const app = new Hono<Env>()
    configureMiddleware(app)
    const res = await app.request('/health')
    const csp = res.headers.get('Content-Security-Policy')
    expect(csp).toContain("base-uri 'self'")
  })

  it('omits CSP on a 304 so the revalidated cache keeps the nonce that matches its stored body', async () => {
    const app = new Hono<Env>()
    configureMiddleware(app)
    app.get('/favicon-csp-304-probe', (c) => c.body(null, 304))
    const res = await app.request('/favicon-csp-304-probe')
    expect(res.status).toBe(304)
    // Neither the dynamic per-request policy nor the static secureHeaders one:
    // RFC 9111 §4.3.4 folds these headers into the stored entry, whose inline
    // scripts carry the ORIGINAL nonce.
    expect(res.headers.get('Content-Security-Policy')).toBeNull()
  })
})

describe('static fallback CSP script-src', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  function staticScriptSrc(csp: string | null): string {
    expect(csp).not.toBeNull()
    return /script-src[^;]+/.exec(csp ?? '')?.[0] ?? ''
  }

  it('drops unsafe-inline in production (no HTML response keeps this policy)', async () => {
    vi.stubEnv('DEV', false)
    const app = new Hono<Env>()
    configureMiddleware(app)
    const res = await app.request('/wp-login.php')
    expect(res.status).toBe(404)
    const scriptSrc = staticScriptSrc(res.headers.get('Content-Security-Policy'))
    expect(scriptSrc).toBe("script-src 'self'")
  })

  it('keeps unsafe-inline in development for Vite / React Router tooling', async () => {
    vi.stubEnv('DEV', true)
    const app = new Hono<Env>()
    configureMiddleware(app)
    const res = await app.request('/wp-login.php')
    expect(res.status).toBe(404)
    expect(staticScriptSrc(res.headers.get('Content-Security-Policy'))).toBe("script-src 'self' 'unsafe-inline'")
  })
})

describe('readiness probe', () => {
  it('reports 503 with the real phase — the it harness never leaves booting', async () => {
    const app = new Hono<Env>()
    configureMiddleware(app)
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
    const rowsBefore = await db.select({ id: sessionTable.id }).from(sessionTable)
    const res = await app.request('/health')
    const rowsAfter = await db.select({ id: sessionTable.id }).from(sessionTable)
    expect(rowsAfter.length).toBe(rowsBefore.length)

    const setCookies = res.headers.getSetCookie()
    expect(setCookies.some((v) => v.startsWith('__session='))).toBe(false)
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

describe('trustProxy scheme fix (real pipeline)', () => {
  function probeApp() {
    const app = new Hono<Env>()
    configureMiddleware(app)
    app.get('/favicon-scheme-probe', (c) => c.text(c.var.requestContext.url.href))
    return app
  }

  it('rewrites to the proxy-reported scheme when the site URL is https', async () => {
    setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
    const res = await probeApp().request('http://yufan.me/favicon-scheme-probe', {
      headers: { 'x-forwarded-proto': 'https' },
    })
    expect(await res.text()).toBe('https://yufan.me/favicon-scheme-probe')
  })

  it('assumes https for the canonical host even without a proxy header', async () => {
    setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
    const res = await probeApp().request('http://example.com/favicon-scheme-probe')
    expect(await res.text()).toBe('https://example.com/favicon-scheme-probe')
  })

  it('ignores proxy headers when no https site URL is configured', async () => {
    resetBlogSettingsForTests()
    const res = await probeApp().request('http://yufan.me/favicon-scheme-probe', {
      headers: { 'x-forwarded-proto': 'https' },
    })
    expect(await res.text()).toBe('http://yufan.me/favicon-scheme-probe')
  })
})

describe('buildLoadContext', () => {
  it('hydrates settings against the real database and returns a RouterContextProvider', async () => {
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
