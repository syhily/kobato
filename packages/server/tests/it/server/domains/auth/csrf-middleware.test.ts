import type { BlogSessionData } from '@kobato/server/domains/auth/session-storage.ts'
import type { Env } from '@kobato/server/http/hono-env.ts'

import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/test/blog-settings.ts'
import { createSession } from 'react-router'
import { describe, expect, it } from 'vitest'

function makeSession(data: Partial<BlogSessionData> = {}) {
  return createSession<BlogSessionData, BlogSessionData>(data, 'test-session')
}

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
    const { csrfGuard } = await import('@kobato/server/http/middlewares/csrf.ts')
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
})
