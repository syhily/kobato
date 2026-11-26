import type { Env } from '@kobato/server/http/hono-env'

import { makeSession } from '@kobato/server/tests/utils/session'
import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings'
import { describe, expect, it } from 'vitest'

const PROCEDURE_ROUTES: readonly string[] = [
  '/rpc/public/content/bootstrap',
  '/rpc/content/bootstrap',
  '/rpc/public/comments/getRaw',
  '/rpc/public/comments/replyComment',
  '/rpc/account/notifications/list',
  '/rpc/admin/analytics/overview',
]

function seedCsrfSettings(csrf: { enabled: boolean; exemptPaths: string[] }): void {
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    security: {
      ...TEST_BLOG_SETTINGS_BUNDLE.security!,
      csrf,
    },
  })
}

function seedExemptPaths(exemptPaths: string[]): void {
  seedCsrfSettings({ enabled: true, exemptPaths })
}

describe('csrfGuard middleware', () => {
  async function setupApp() {
    const { Hono } = await import('hono')
    const { csrfGuard } = await import('@kobato/server/http/middlewares/csrf')
    const app = new Hono<Env>()
    app.use('*', async (c, next) => {
      c.set('requestContext', {
        session: makeSession({ csrfToken: 'valid-token' }),
      } as unknown as Env['Variables']['requestContext'])
      await next()
    })
    app.use('/rpc/*', csrfGuard)
    app.post('/rpc/test', (c) => c.json({ ok: true }))
    app.post('/rpc/webhook', (c) => c.json({ ok: true }))
    app.post('/rpc/webhook/event', (c) => c.json({ ok: true }))
    app.post('/rpc/webhookx', (c) => c.json({ ok: true }))
    for (const route of PROCEDURE_ROUTES) {
      app.post(route, (c) => c.json({ ok: true }))
    }
    return app
  }

  it('returns 403 when X-CSRF-Token header is missing', async () => {
    const app = await setupApp()
    const res = await app.request('/rpc/test', { method: 'POST' })
    expect(res.status).toBe(403)
  })

  it('returns 403 when header value does not match session token', async () => {
    const app = await setupApp()
    const res = await app.request('/rpc/test', {
      method: 'POST',
      headers: { 'X-CSRF-Token': 'wrong-token' },
    })
    expect(res.status).toBe(403)
  })

  it('passes through when header matches session token', async () => {
    const app = await setupApp()
    const res = await app.request('/rpc/test', {
      method: 'POST',
      headers: { 'X-CSRF-Token': 'valid-token' },
    })
    expect(res.status).toBe(200)
  })

  it('passes through when path matches an exempt prefix', async () => {
    seedExemptPaths(['/rpc/webhook'])
    const app = await setupApp()
    const res = await app.request('/rpc/webhook/event', { method: 'POST' })
    expect(res.status).toBe(200)
  })

  it('still validates when path does not match any exempt prefix', async () => {
    seedExemptPaths(['/rpc/webhook'])
    const app = await setupApp()
    const res = await app.request('/rpc/test', { method: 'POST' })
    expect(res.status).toBe(403)
  })

  it('passes through when path equals the exempt prefix exactly', async () => {
    seedExemptPaths(['/rpc/webhook'])
    const app = await setupApp()
    const res = await app.request('/rpc/webhook', { method: 'POST' })
    expect(res.status).toBe(200)
  })

  it('does not exempt a look-alike path that merely shares the prefix', async () => {
    seedExemptPaths(['/rpc/webhook'])
    const app = await setupApp()
    const res = await app.request('/rpc/webhookx', { method: 'POST' })
    expect(res.status).toBe(403)
  })

  it('skips validation entirely when security.csrf.enabled is false', async () => {
    seedCsrfSettings({ enabled: false, exemptPaths: [] })
    const app = await setupApp()
    const res = await app.request('/rpc/test', { method: 'POST' })
    expect(res.status).toBe(200)
  })

  it('exempts the declared anonymous public-read procedures without a CSRF header (canonical only)', async () => {
    const app = await setupApp()
    const canonical = await app.request('/rpc/public/content/bootstrap', { method: 'POST' })
    expect(canonical.status).toBe(200)
  })

  it('no longer exempts the removed pre-grouping alias', async () => {
    const app = await setupApp()
    const legacy = await app.request('/rpc/content/bootstrap', { method: 'POST' })
    expect(legacy.status).toBe(403)
  })

  it.each([
    '/rpc/public/comments/getRaw',
    '/rpc/comments/getRaw',
    '/rpc/public/comments/replyComment',
    '/rpc/comments/replyComment',
    '/rpc/account/notifications/list',
    '/rpc/notifications/list',
    '/rpc/admin/analytics/overview',
    '/rpc/analytics/overview',
  ])('still requires the CSRF header for the non-exempt procedure %s', async (path) => {
    const app = await setupApp()
    const res = await app.request(path, { method: 'POST' })
    expect(res.status).toBe(403)
  })
})
