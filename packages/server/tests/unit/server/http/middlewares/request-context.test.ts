import type { Env } from '@kobato/server/http/hono-env'
import type { RequestContext } from '@kobato/server/http/request-context'

import { databaseOf } from '@kobato/db/sqlite/database'
import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { deriveStatelessCsrfToken } from '@kobato/server/domains/auth/csrf'
import { adminUser, makeSession } from '@kobato/server/tests/utils/session'
import { Hono } from 'hono'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

const EXISTING_CSRF_COOKIE = 'a'.repeat(64)

const sessionContextModule = await import('@kobato/server/domains/auth/primitives')
const sessionStorageModule = await import('@kobato/server/domains/auth/session-storage')
const clientAddressModule = await import('@kobato/api/client/client-address')

describe('requestContextMiddleware', () => {
  const fakeDb = databaseOf(getDatabaseHandle())

  const resolveSessionContext = vi.spyOn(sessionContextModule, 'resolveSessionContext').mockImplementation(async () => {
    const user = adminUser()
    const session = makeSession({ user })
    return { session, user, dirty: false }
  })
  const commitSessionWithMaxAge = vi
    .spyOn(sessionStorageModule, 'commitSessionWithMaxAge')
    .mockResolvedValue('__session=abc' as never)
  const getClientAddress = vi.spyOn(clientAddressModule, 'getClientAddress').mockReturnValue('192.168.1.1')

  afterEach(() => {
    resolveSessionContext.mockClear()
    commitSessionWithMaxAge.mockClear()
    getClientAddress.mockClear()
  })

  afterAll(() => {
    resolveSessionContext.mockRestore()
    commitSessionWithMaxAge.mockRestore()
    getClientAddress.mockRestore()
  })

  async function buildApp(sessionCtx: { dirty?: boolean } = {}, options: { presetCsrfToken?: boolean } = {}) {
    const user = adminUser()
    const session = makeSession({ user })
    if (options.presetCsrfToken !== false) {
      session.set('csrfToken', 'preset-token')
    }
    resolveSessionContext.mockImplementation(async () => ({ session, user, dirty: false, ...sessionCtx }) as never)

    const { requestContextMiddleware } = await import('@kobato/server/http/middlewares/request-context')
    const app = new Hono<Env>()
    app.use(requestContextMiddleware)
    return { app, session, user }
  }

  const sessionCookie = { Cookie: '__session=test-session' }

  it('sets c.var.requestContext with the derived fields', async () => {
    const { app, session, user } = await buildApp()
    let captured: RequestContext | undefined
    app.get('/posts.data', (c) => {
      captured = c.var.requestContext
      return c.json({ ok: true })
    })
    const res = await app.request('/posts.data?_routes=routes%2Fposts&index', { headers: sessionCookie })
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

  it('pins the settings bundle and localization from ONE snapshot capture', async () => {
    const { app } = await buildApp()
    const { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } =
      await import('@kobato/settings/tests/utils/blog-settings')
    const { resolveAppLocalization } = await import('@kobato/settings/app-localization')
    setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)

    app.get('/', (c) => {
      const rc = c.var.requestContext
      const settings = rc.settings
      const localization = rc.localization
      setBlogSettingsBundleForTests({
        ...TEST_BLOG_SETTINGS_BUNDLE,
        siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, locale: 'en-US' },
      })
      return c.json({
        settingsLocale: settings?.siteIdentity?.locale,
        locale: localization.locale,
        revision: localization.revision,
        laterLocale: c.var.requestContext.localization.locale,
        laterRevision: c.var.requestContext.localization.revision,
        sameBundle: c.var.requestContext.settings === settings,
      })
    })

    const res = await app.request('/', { headers: sessionCookie })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      settingsLocale: 'zh-CN',
      locale: 'zh-CN',
      laterLocale: 'zh-CN',
      sameBundle: true,
    })
    expect(resolveAppLocalization().locale).toBe('en-US')
  })

  it('sets Set-Cookie when the handler marks the session dirty', async () => {
    const { app } = await buildApp()
    app.get('/', (c) => {
      c.var.requestContext.markSessionDirty()
      return c.json({ ok: true })
    })
    const res = await app.request('/', { headers: sessionCookie })
    expect(res.status).toBe(200)
    expect(res.headers.get('Set-Cookie')).toBe('__session=abc')
  })

  it('keys the direct peer on the socket port when remoteAddress is unavailable', async () => {
    const { app } = await buildApp()
    app.get('/', (c) => c.json({ ok: true }))
    const env = { incoming: { socket: { remotePort: 43210 } } }
    const res = await app.request('/', { headers: sessionCookie }, env)
    expect(res.status).toBe(200)
    expect(getClientAddress).toHaveBeenCalledWith(expect.any(Request), 'port:43210', expect.any(Array))
  })

  it('leaves the direct peer undefined when the socket reports neither address nor port (Unix socket)', async () => {
    const { app } = await buildApp()
    app.get('/', (c) => c.json({ ok: true }))
    const res = await app.request('/', { headers: sessionCookie }, { incoming: { socket: {} } })
    expect(res.status).toBe(200)
    expect(getClientAddress).toHaveBeenCalledWith(expect.any(Request), undefined, expect.any(Array))
  })

  it('sets Set-Cookie when session resolution is dirty', async () => {
    const { app } = await buildApp({ dirty: true })
    app.get('/', (c) => c.json({ ok: true }))
    const res = await app.request('/', { headers: sessionCookie })
    expect(res.status).toBe(200)
    expect(res.headers.get('Set-Cookie')).toBe('__session=abc')
  })

  it('does not set cookie when session is clean', async () => {
    const { app } = await buildApp({ dirty: false })
    app.get('/', (c) => c.json({ ok: true }))
    const res = await app.request('/', { headers: sessionCookie })
    expect(res.headers.get('Set-Cookie')).toBeNull()
  })

  it('yields to a route that set the session cookie itself (login rotation / logout)', async () => {
    const { app } = await buildApp({ dirty: true })
    app.get('/', (c) => {
      c.header('Set-Cookie', '__session=new-sid', { append: true })
      return c.json({ ok: true })
    })
    const res = await app.request('/', { headers: sessionCookie })
    expect(res.headers.getSetCookie()).toEqual(['__session=new-sid'])
  })

  it('still commits when the route only set an unrelated cookie', async () => {
    const { app } = await buildApp({ dirty: true })
    app.get('/', (c) => {
      c.header('Set-Cookie', 'visitor=xyz', { append: true })
      return c.json({ ok: true })
    })
    const res = await app.request('/', { headers: sessionCookie })
    expect(res.headers.getSetCookie()).toEqual(['visitor=xyz', '__session=abc'])
  })

  it('anonymous GET: no session write, no __session cookie, token derived from a minted __csrf cookie', async () => {
    const { app, session } = await buildApp()
    app.get('/', (c) => c.json({ ok: true }))
    const res = await app.request('/')
    expect(res.status).toBe(200)
    expect(commitSessionWithMaxAge).not.toHaveBeenCalled()
    const setCookies = res.headers.getSetCookie()
    expect(setCookies.some((v) => v.startsWith('__session='))).toBe(false)
    expect(setCookies).toHaveLength(1)
    const minted = /^__csrf=([a-f0-9]{64}); Path=\/; HttpOnly; SameSite=Lax$/.exec(setCookies[0]!)?.[1]
    expect(minted).toBeDefined()
    expect(session.get('csrfToken')).toBe(deriveStatelessCsrfToken(minted!))
  })

  it('anonymous GET with a valid __csrf cookie: reuses it, sets nothing, writes nothing', async () => {
    const { app, session } = await buildApp()
    app.get('/', (c) => c.json({ ok: true }))
    const res = await app.request('/', { headers: { Cookie: `__csrf=${EXISTING_CSRF_COOKIE}` } })
    expect(res.status).toBe(200)
    expect(commitSessionWithMaxAge).not.toHaveBeenCalled()
    expect(res.headers.getSetCookie()).toEqual([])
    expect(session.get('csrfToken')).toBe(deriveStatelessCsrfToken(EXISTING_CSRF_COOKIE))
  })

  it('anonymous POST without cookies: no token, no cookie, no session write', async () => {
    const { app, session } = await buildApp({}, { presetCsrfToken: false })
    app.post('/', (c) => c.json({ ok: true }))
    const res = await app.request('/', { method: 'POST' })
    expect(res.status).toBe(200)
    expect(commitSessionWithMaxAge).not.toHaveBeenCalled()
    expect(res.headers.getSetCookie()).toEqual([])
    expect(session.get('csrfToken')).toBeUndefined()
  })

  it('anonymous POST to a public-read RPC path mints exactly what a safe document GET mints', async () => {
    const { app, session } = await buildApp({}, { presetCsrfToken: false })
    app.post('/rpc/public/content/bootstrap', (c) => c.json({ ok: true }))
    const res = await app.request('/rpc/public/content/bootstrap', { method: 'POST' })
    expect(res.status).toBe(200)
    expect(commitSessionWithMaxAge).not.toHaveBeenCalled()
    const setCookies = res.headers.getSetCookie()
    expect(setCookies.some((v) => v.startsWith('__session='))).toBe(false)
    expect(setCookies).toHaveLength(1)
    const minted = /^__csrf=([a-f0-9]{64}); Path=\/; HttpOnly; SameSite=Lax$/.exec(setCookies[0]!)?.[1]
    expect(minted).toBeDefined()
    expect(session.get('csrfToken')).toBe(deriveStatelessCsrfToken(minted!))
  })

  it('anonymous POST to a public-read RPC path with a valid __csrf cookie reuses it and mints nothing', async () => {
    const { app, session } = await buildApp({}, { presetCsrfToken: false })
    app.post('/rpc/public/content/home', (c) => c.json({ ok: true }))
    const res = await app.request('/rpc/public/content/home', {
      method: 'POST',
      headers: { Cookie: `__csrf=${EXISTING_CSRF_COOKIE}` },
    })
    expect(res.status).toBe(200)
    expect(commitSessionWithMaxAge).not.toHaveBeenCalled()
    expect(res.headers.getSetCookie()).toEqual([])
    expect(session.get('csrfToken')).toBe(deriveStatelessCsrfToken(EXISTING_CSRF_COOKIE))
  })

  it('anonymous POST to a non-public-read RPC path mints nothing', async () => {
    const { app, session } = await buildApp({}, { presetCsrfToken: false })
    app.post('/rpc/account/auth/login', (c) => c.json({ ok: true }))
    app.post('/rpc/public/comments/replyComment', (c) => c.json({ ok: true }))
    for (const path of ['/rpc/account/auth/login', '/rpc/public/comments/replyComment']) {
      const res = await app.request(path, { method: 'POST' })
      expect(res.status).toBe(200)
      expect(res.headers.getSetCookie(), path).toEqual([])
    }
    expect(session.get('csrfToken')).toBeUndefined()
    expect(commitSessionWithMaxAge).not.toHaveBeenCalled()
  })

  it('anonymous request with a session cookie on a public-read RPC path ensures the session token instead of minting', async () => {
    const { app, session } = await buildApp({}, { presetCsrfToken: false })
    app.post('/rpc/public/content/bootstrap', (c) => c.json({ ok: true }))
    const res = await app.request('/rpc/public/content/bootstrap', {
      method: 'POST',
      headers: sessionCookie,
    })
    expect(res.status).toBe(200)
    expect(session.get('csrfToken')).toBeDefined()
    const setCookies = res.headers.getSetCookie()
    expect(setCookies.some((v) => v.startsWith('__csrf='))).toBe(false)
    expect(commitSessionWithMaxAge).toHaveBeenCalled()
  })

  it('anonymous GET with an invalid __csrf cookie value: remints instead of trusting it', async () => {
    const { app, session } = await buildApp()
    app.get('/', (c) => c.json({ ok: true }))
    const res = await app.request('/', { headers: { Cookie: '__csrf=not-a-real-value' } })
    const setCookies = res.headers.getSetCookie()
    expect(setCookies).toHaveLength(1)
    const minted = /^__csrf=([a-f0-9]{64}); Path=\/; HttpOnly; SameSite=Lax$/.exec(setCookies[0]!)?.[1]
    expect(minted).toBeDefined()
    expect(session.get('csrfToken')).toBe(deriveStatelessCsrfToken(minted!))
  })

  it('anonymous GET with a malformed percent-escape in a cookie: treated as absent, no 500', async () => {
    const { app, session } = await buildApp()
    app.get('/', (c) => c.json({ ok: true }))
    const res = await app.request('/', { headers: { Cookie: '__csrf=%E4%A' } })
    expect(res.status).toBe(200)
    const setCookies = res.headers.getSetCookie()
    expect(setCookies).toHaveLength(1)
    const minted = /^__csrf=([a-f0-9]{64}); Path=\/; HttpOnly; SameSite=Lax$/.exec(setCookies[0]!)?.[1]
    expect(minted).toBeDefined()
    expect(session.get('csrfToken')).toBe(deriveStatelessCsrfToken(minted!))
  })

  it('anonymous GET with an empty __session cookie value: treated as no session cookie', async () => {
    const { app, session } = await buildApp()
    app.get('/', (c) => c.json({ ok: true }))
    const res = await app.request('/', { headers: { Cookie: '__session=' } })
    expect(res.status).toBe(200)
    expect(commitSessionWithMaxAge).not.toHaveBeenCalled()
    const setCookies = res.headers.getSetCookie()
    expect(setCookies.some((v) => v.startsWith('__session='))).toBe(false)
    expect(setCookies).toHaveLength(1)
    const minted = /^__csrf=([a-f0-9]{64}); Path=\/; HttpOnly; SameSite=Lax$/.exec(setCookies[0]!)?.[1]
    expect(minted).toBeDefined()
    expect(session.get('csrfToken')).toBe(deriveStatelessCsrfToken(minted!))
  })

  it('anonymous GET on a cookie-exempt path (workspace assets): mints nothing', async () => {
    const { app, session } = await buildApp({}, { presetCsrfToken: false })
    app.get('/admin/assets/entry-abc.js', (c) => c.json({ ok: true }))
    const res = await app.request('/admin/assets/entry-abc.js')
    expect(res.headers.getSetCookie()).toEqual([])
    expect(session.get('csrfToken')).toBeUndefined()
    expect(commitSessionWithMaxAge).not.toHaveBeenCalled()
  })

  it('anonymous GET on a former public-asset path now mints the anonymous cookie', async () => {
    const { app } = await buildApp({}, { presetCsrfToken: false })
    app.get('/assets/main.js', (c) => c.json({ ok: true }))
    const res = await app.request('/assets/main.js')
    expect(res.headers.getSetCookie().some((cookie) => cookie.startsWith('__csrf='))).toBe(true)
  })

  it('anonymous request can still commit when the route marks the session dirty (OTP/setup explicit flows)', async () => {
    const { app } = await buildApp()
    app.post('/', (c) => {
      c.var.requestContext.markSessionDirty()
      return c.json({ ok: true })
    })
    const res = await app.request('/', { method: 'POST' })
    expect(commitSessionWithMaxAge).toHaveBeenCalled()
    expect(res.headers.getSetCookie()).toContain('__session=abc')
  })
})
