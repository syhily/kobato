import { createSession } from 'react-router'
import { describe, expect, it } from 'vitest'

import type { BlogSessionData } from '@/server/domains/auth/session-storage'
import type { Env } from '@/server/http/context'

import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'

// The csrf module runs for real: `validateCsrfToken` is a pure
// constant-time comparison and `isPathExempt` reads the settings bundle,
// so the exempt-path cases seed a bundle instead of mocking the module.
// (The it setup's afterEach restores the default bundle automatically.)

function makeSession(data: Partial<BlogSessionData> = {}) {
  return createSession<BlogSessionData, BlogSessionData>(data, 'test-session')
}

function seedExemptPaths(exemptPaths: string[]): void {
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    security: {
      ...TEST_BLOG_SETTINGS_BUNDLE.security!,
      csrf: { enabled: true, exemptPaths },
    },
  })
}

describe('csrfGuard middleware', () => {
  async function setupApp() {
    const { Hono } = await import('hono')
    const { csrfGuard } = await import('@/server/http/middlewares/csrf')
    const app = new Hono<Env>()
    // Minimal requestContext stub on c.var — csrfGuard only reads .session
    app.use('*', async (c, next) => {
      c.set('requestContext', {
        session: makeSession({ csrfToken: 'valid-token' }),
      } as unknown as Env['Variables']['requestContext'])
      await next()
    })
    app.use('/rpc/*', csrfGuard)
    app.post('/rpc/test', (c) => c.json({ ok: true }))
    app.post('/rpc/webhook/event', (c) => c.json({ ok: true }))
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
})
