import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'
import type { RequestContext } from '@/server/http/request-context'

import { adminUser, makeSession } from '#/_helpers/session'

describe('requestContextMiddleware', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  const fakeDb = {}

  async function buildApp(mocks: { sessionCtx?: { dirty?: boolean } } = {}) {
    const user = adminUser()
    const session = makeSession({ user })
    vi.doMock('@/server/bootstrap/db-lifecycle', () => ({
      getDb: vi.fn(() => fakeDb),
    }))
    vi.doMock('@/server/domains/auth/primitives', () => ({
      resolveSessionContext: vi.fn().mockResolvedValue({
        session,
        user,
        dirty: false,
        ...mocks.sessionCtx,
      }),
    }))
    vi.doMock('@/server/domains/auth/csrf', () => ({
      ensureCsrfToken: vi.fn(),
    }))
    vi.doMock('@/server/domains/auth/session-storage', () => ({
      commitSessionWithMaxAge: vi.fn().mockResolvedValue('__session=abc'),
      SESSION_COOKIE_NAME: '__session',
    }))
    vi.doMock('@/server/http/utils/client-address', () => ({
      getClientAddress: vi.fn().mockReturnValue('192.168.1.1'),
    }))

    const { requestContextMiddleware } = await import('@/server/http/middlewares/request-context')
    const app = new Hono<Env>()
    app.use(requestContextMiddleware)
    return { app, session, user }
  }

  it('sets c.var.requestContext with the derived fields', async () => {
    const { app, session, user } = await buildApp()
    let captured: RequestContext | undefined
    app.get('/posts.data', (c) => {
      captured = c.var.requestContext
      return c.json({ ok: true })
    })
    const res = await app.request('/posts.data?_routes=routes%2Fposts&index')
    expect(res.status).toBe(200)
    expect(captured?.session).toBe(session)
    expect(captured?.viewer).toEqual(user)
    expect(captured?.clientAddress).toBe('192.168.1.1')
    expect(captured?.url.pathname).toBe('/posts')
    expect(captured?.url.search).toBe('')
    expect(captured?.requestFacts).toMatchObject({ path: '/posts', isDataRequest: true })
    expect(captured?.db).toBe(fakeDb)
    expect(captured?.cspNonce).toEqual(expect.any(String))
    expect(captured?.markSessionDirty).toEqual(expect.any(Function))
  })

  it('sets Set-Cookie when the handler marks the session dirty', async () => {
    const { app } = await buildApp()
    app.get('/', (c) => {
      c.var.requestContext.markSessionDirty()
      return c.json({ ok: true })
    })
    const res = await app.request('/')
    expect(res.status).toBe(200)
    expect(res.headers.get('Set-Cookie')).toBe('__session=abc')
  })

  it('sets Set-Cookie when session resolution is dirty', async () => {
    const { app } = await buildApp({ sessionCtx: { dirty: true } })
    app.get('/', (c) => c.json({ ok: true }))
    const res = await app.request('/')
    expect(res.status).toBe(200)
    expect(res.headers.get('Set-Cookie')).toBe('__session=abc')
  })

  it('does not set cookie when session is clean', async () => {
    const { app } = await buildApp({ sessionCtx: { dirty: false } })
    app.get('/', (c) => c.json({ ok: true }))
    const res = await app.request('/')
    expect(res.headers.get('Set-Cookie')).toBeNull()
  })

  it('yields to a route that set the session cookie itself (login rotation / logout)', async () => {
    const { app } = await buildApp({ sessionCtx: { dirty: true } })
    app.get('/', (c) => {
      // The route owns the cookie channel for this response — e.g. a
      // sid-rotating login or a session-destroying logout.
      c.header('Set-Cookie', '__session=new-sid', { append: true })
      return c.json({ ok: true })
    })
    const res = await app.request('/')
    // The middleware's dirty commit must NOT land after the route's header
    // (last Set-Cookie wins — appending would resurrect the old sid).
    expect(res.headers.getSetCookie()).toEqual(['__session=new-sid'])
  })

  it('still commits when the route only set an unrelated cookie', async () => {
    const { app } = await buildApp({ sessionCtx: { dirty: true } })
    app.get('/', (c) => {
      c.header('Set-Cookie', 'visitor=xyz', { append: true })
      return c.json({ ok: true })
    })
    const res = await app.request('/')
    expect(res.headers.getSetCookie()).toEqual(['visitor=xyz', '__session=abc'])
  })
})
