import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

import { adminUser } from '#/_helpers/session'

describe('honoSessionMiddleware', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  async function buildApp(mocks: { sessionCtx?: object } = {}) {
    vi.doMock('@/server/domains/auth/primitives', () => ({
      resolveSessionContext: vi.fn().mockResolvedValue({
        session: {
          id: 'test-session',
          get: vi.fn((key: string) => (key === 'user' ? adminUser() : undefined)),
          set: vi.fn(),
          unset: vi.fn(),
        },
        user: adminUser(),
        dirty: false,
        ...mocks.sessionCtx,
      }),
    }))
    vi.doMock('@/server/domains/auth/csrf', () => ({
      ensureCsrfToken: vi.fn(),
    }))
    vi.doMock('@/server/domains/auth/session-storage', () => ({
      commitSessionWithMaxAge: vi.fn().mockResolvedValue('__session=abc'),
    }))
    vi.doMock('@/server/http/utils/client-address', () => ({
      getClientAddress: vi.fn().mockReturnValue('192.168.1.1'),
    }))

    const { honoSessionMiddleware } = await import('@/server/http/middlewares/session')
    const app = new Hono<Env>()
    app.use(honoSessionMiddleware)
    app.get('/', (c) => c.json({ viewer: c.var.viewer, clientAddress: c.var.clientAddress }))
    return app
  }

  it('sets viewer and clientAddress', async () => {
    const app = await buildApp()
    const res = await app.request('/')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      viewer: { userId: adminUser().id, role: adminUser().role },
      clientAddress: '192.168.1.1',
    })
  })

  it('sets Set-Cookie when session is dirty', async () => {
    const app = await buildApp({ sessionCtx: { dirty: true } })
    const res = await app.request('/')
    expect(res.status).toBe(200)
    expect(res.headers.get('Set-Cookie')).toBe('__session=abc')
  })

  it('does not set cookie when session is clean', async () => {
    const app = await buildApp({ sessionCtx: { dirty: false } })
    const res = await app.request('/')
    expect(res.headers.get('Set-Cookie')).toBeNull()
  })
})

describe('buildRouteContexts', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('builds session and request contexts', async () => {
    const user = adminUser()
    const session = {
      get: vi.fn((key: string) => (key === 'user' ? user : undefined)),
    }

    vi.doMock('@/server/domains/auth/primitives', () => ({
      resolveSessionContext: vi.fn(),
    }))

    const { buildRouteContexts } = await import('@/server/http/middlewares/session')
    const contexts = buildRouteContexts({
      var: { session, clientAddress: '192.168.1.1' } as unknown as Env['Variables'],
      req: { raw: new Request('http://localhost/posts'), url: 'http://localhost/posts' },
    })

    expect(contexts.session.user).toEqual(user)
    expect(contexts.request.clientAddress).toBe('192.168.1.1')
    expect(contexts.request.url.pathname).toBe('/posts')
  })
})
