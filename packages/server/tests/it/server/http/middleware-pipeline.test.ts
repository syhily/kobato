import type { Env } from '@kobato/server/http/hono-env'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { session as sessionTable } from '@kobato/db/sqlite/schema/session'
import { configureMiddleware } from '@kobato/server/http/middleware-pipeline'
import { requestTimeout } from '@kobato/server/http/middlewares/request-timeout'
import { REQUEST_TIMEOUT_OVERRIDES } from '@kobato/server/http/request/rpc-timeout-overrides'
import { getTestDb } from '@kobato/server/tests/utils/integration-db'
import { siteUsesHttps } from '@kobato/settings/csp'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters'
import {
  resetBlogSettingsForTests,
  setBlogSettingsBundleForTests,
  TEST_BLOG_SETTINGS_BUNDLE,
} from '@kobato/settings/tests/utils/blog-settings'
import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'

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

  it('mounts only the rpc transport beside the probes — no resource routers remain', () => {
    for (const dev of [true, false]) {
      vi.stubEnv('DEV', dev)
      const app = new Hono<Env>()
      configureMiddleware(app)
      const paths = app.routes.map((route) => route.path)
      expect(paths).toContain('/rpc/*')
      expect(paths).not.toContain('/api/rum/status')
      expect(paths).not.toContain('/api/rum/intake/*')
      expect(paths).not.toContain('/webmention')
      expect(paths).not.toContain('/api/dev/rum/status')
    }
  })
})

describe('static CSP middleware', () => {
  it('answers every response with the static secureHeaders policy — kobato no longer renders documents', async () => {
    const app = new Hono<Env>()
    configureMiddleware(app)
    const res = await app.request('/health')
    const csp = res.headers.get('Content-Security-Policy')
    expect(csp).toContain("default-src 'self'")
    expect(csp).not.toContain("base-uri 'self'")
    expect(csp).not.toContain('nonce-')
  })

  it('sets no per-request dynamic CSP, Accept-CH, or Webmention Link header', async () => {
    const app = new Hono<Env>()
    configureMiddleware(app)
    const res = await app.request('/health')
    expect(res.headers.get('Accept-CH')).toBeNull()
    expect(res.headers.get('Link')).toBeNull()
  })

  it('keeps the conditional HSTS header for an https site', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, website: 'https://example.com' },
    } as never)
    const app = new Hono<Env>()
    configureMiddleware(app)
    const res = await app.request('/health')
    expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=15552000; includeSubDomains')
    expect(siteUsesHttps(getBlogSettingsBundleSync())).toBe(true)
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
    const rowsBefore = await sqliteOf(db).select({ id: sessionTable.id }).from(sessionTable)
    const res = await app.request('/health')
    const rowsAfter = await sqliteOf(db).select({ id: sessionTable.id }).from(sessionTable)
    expect(rowsAfter.length).toBe(rowsBefore.length)

    const setCookies = res.headers.getSetCookie()
    expect(setCookies.some((v) => v.startsWith('__session='))).toBe(false)
    expect(setCookies.some((v) => v.startsWith('__csrf='))).toBe(true)
  })

  it('cookieless POST writes no session row and mints no cookies', async () => {
    const app = new Hono<Env>()
    configureMiddleware(app)
    const db = getTestDb()
    const rowsBefore = await sqliteOf(db).select({ id: sessionTable.id }).from(sessionTable)
    const res = await app.request('/health', { method: 'POST' })
    const rowsAfter = await sqliteOf(db).select({ id: sessionTable.id }).from(sessionTable)
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
    app.get('/admin/assets/scheme-probe', (c) => c.text(c.var.requestContext.url.href))
    return app
  }

  it('rewrites to the proxy-reported scheme when the site URL is https', async () => {
    setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
    const res = await probeApp().request('http://yufan.me/admin/assets/scheme-probe', {
      headers: { 'x-forwarded-proto': 'https' },
    })
    expect(await res.text()).toBe('https://yufan.me/admin/assets/scheme-probe')
  })

  it('assumes https for the canonical host even without a proxy header', async () => {
    setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
    const res = await probeApp().request('http://example.com/admin/assets/scheme-probe')
    expect(await res.text()).toBe('https://example.com/admin/assets/scheme-probe')
  })

  it('ignores proxy headers when no https site URL is configured', async () => {
    resetBlogSettingsForTests()
    const res = await probeApp().request('http://yufan.me/admin/assets/scheme-probe', {
      headers: { 'x-forwarded-proto': 'https' },
    })
    expect(await res.text()).toBe('http://yufan.me/admin/assets/scheme-probe')
  })
})

describe('request-timeout restore exemptions', () => {
  function probeApp() {
    const app = new Hono<Env>()
    app.use(requestTimeout(30_000, REQUEST_TIMEOUT_OVERRIDES))
    app.use('*', async (c) => {
      await new Promise<void>((resolve) => {
        c.req.raw.signal.addEventListener('abort', () => resolve(), { once: true })
        setTimeout(resolve, 31_000)
      })
      return c.json({ aborted: c.req.raw.signal.aborted })
    })
    return app
  }

  it('pins the restore upload/setup/decrypt RPC timeout overrides', () => {
    expect([...REQUEST_TIMEOUT_OVERRIDES].sort((a, b) => a.prefix.localeCompare(b.prefix))).toEqual([
      { prefix: '/rpc/account/setup/restore', timeoutMs: 1_800_000 },
      { prefix: '/rpc/admin/backup/uploadRestore', timeoutMs: 1_800_000 },
      { prefix: '/rpc/admin/backup/uploadRestoreDecrypt', timeoutMs: 1_800_000 },
    ])
  })

  it.each([
    ['/rpc/admin/backup/uploadRestore', false],
    ['/rpc/admin/backup/uploadRestoreDecrypt', false],
    ['/rpc/admin/backup/uploadRestoreDecrypt', false],
    ['/rpc/admin/backup/uploadRestoreDecrypt/timeout-probe', false],
    ['/rpc/account/setup/restore', false],
    ['/rpc/timeout-control-probe', true],
  ])('budgets %s — default-abort=%s', async (path, expectDefaultAbort) => {
    vi.useFakeTimers()
    try {
      const pending = probeApp().request(path, { method: 'POST' })
      await vi.advanceTimersByTimeAsync(31_000)
      const res = await pending
      expect(res.status).toBe(200)
      expect(((await res.json()) as { aborted: boolean }).aborted).toBe(expectDefaultAbort)
    } finally {
      vi.useRealTimers()
    }
  })
})
