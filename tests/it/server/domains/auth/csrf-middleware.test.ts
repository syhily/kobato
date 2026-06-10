import { createSession } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BlogSessionData } from '@/server/domains/auth/session-storage'
import type { Env } from '@/server/http/context'

const mockIsPathExempt = vi.fn().mockReturnValue(false)

vi.mock('@/server/domains/auth/csrf', () => ({
  isPathExempt: (path: string) => mockIsPathExempt(path),
  validateCsrfToken: (session: { get: (k: string) => string | undefined }, header: string | null) => {
    const token = session.get('csrfToken')
    return !!(token && header && token === header)
  },
  CSRF_HEADER: 'x-csrf-token',
}))

function makeSession(data: Partial<BlogSessionData> = {}) {
  return createSession<BlogSessionData, BlogSessionData>(data, 'test-session')
}

describe('csrfGuard middleware', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mockIsPathExempt.mockReturnValue(false)
  })

  async function setupApp() {
    const { Hono } = await import('hono')
    const { csrfGuard } = await import('@/server/http/middlewares/csrf')
    const app = new Hono<Env>()
    // Minimal session stub on c.var
    app.use('*', async (c, next) => {
      c.set('session', makeSession({ csrfToken: 'valid-token' }) as unknown as Env['Variables']['session'])
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
    mockIsPathExempt.mockImplementation((path: string) => path.startsWith('/rpc/webhook'))
    const app = await setupApp()
    const res = await app.request('/rpc/webhook/event', { method: 'POST' })
    expect(res.status).toBe(200)
  })

  it('still validates when path does not match any exempt prefix', async () => {
    mockIsPathExempt.mockImplementation((path: string) => path.startsWith('/rpc/webhook'))
    const app = await setupApp()
    const res = await app.request('/rpc/test', { method: 'POST' })
    expect(res.status).toBe(403)
  })
})
