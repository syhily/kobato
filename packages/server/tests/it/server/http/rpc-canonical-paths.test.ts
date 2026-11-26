import type { Env } from '@kobato/server/http/hono-env'

import { getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makeRequestContext } from '@kobato/server/tests/utils/request-context'
import { makeSession } from '@kobato/server/tests/utils/session'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

const db = getTestDb()
const CSRF = 'canonical-rpc-csrf-token'

const { onErrorHandler } = await import('@kobato/server/http/errors')
const { createApiApp } = await import('@kobato/server/http/app')

function makeApiApp() {
  const rc = makeRequestContext({ db, session: makeSession({ csrfToken: CSRF }) })
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('requestContext', rc as unknown as Env['Variables']['requestContext'])
    await next()
  })
  app.route('/', createApiApp())
  app.onError(onErrorHandler)
  return app
}

async function rpc(app: ReturnType<typeof makeApiApp>, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers({ 'content-type': 'application/json', 'x-csrf-token': CSRF })
  if (init.headers !== undefined) {
    for (const [key, value] of new Headers(init.headers)) {
      headers.set(key, value)
    }
  }
  return app.request(path, {
    method: 'POST',
    headers,
    body: init.body ?? '{}',
  })
}

async function rpcNoCsrf(app: ReturnType<typeof makeApiApp>, path: string, body = '{}'): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  })
}

describe('canonical-only /rpc/* transport (real HTTP)', () => {
  it.each([
    '/rpc/content/bootstrap',
    '/rpc/content/home',
    '/rpc/comments/loadComments',
    '/rpc/likes/increase',
    '/rpc/notifications/list',
    '/rpc/analytics/overview',
  ])('no longer matches the removed pre-grouping alias %s (404 behind a valid CSRF token)', async (path) => {
    const app = makeApiApp()

    const response = await rpc(app, path, { body: JSON.stringify({ json: {} }) })

    expect(response.status).toBe(404)
  })

  it.each(['/rpc/content/bootstrap', '/rpc/content/home', '/rpc/comments/loadComments'])(
    'no longer exempts the removed anonymous-read alias %s (CSRF 403)',
    async (path) => {
      const app = makeApiApp()

      const response = await rpcNoCsrf(app, path, JSON.stringify({ json: {} }))

      expect(response.status).toBe(403)
    },
  )

  it('leaves unmatched canonical-shaped paths unmatched', async () => {
    const app = makeApiApp()

    const response = await rpc(app, '/rpc/public/content/notAProcedure')

    expect(response.status).toBe(404)
  })

  describe('canonical surface (unchanged)', () => {
    it('serves the frozen anonymous public reads without any CSRF header', async () => {
      const app = makeApiApp()

      const bootstrap = await rpcNoCsrf(app, '/rpc/public/content/bootstrap')
      expect(bootstrap.status).toBe(200)

      const loadComments = await rpcNoCsrf(
        app,
        '/rpc/public/comments/loadComments',
        JSON.stringify({ json: { page_key: '/p', offset: 0 } }),
      )
      expect(loadComments.status).not.toBe(403)
    })

    it.each(['/rpc/public/comments/getRaw', '/rpc/public/comments/replyComment', '/rpc/public/comments/myComments'])(
      'still rejects the token read / comment mutation %s with CSRF 403',
      async (path) => {
        const app = makeApiApp()

        const response = await rpcNoCsrf(app, path, JSON.stringify({ json: { rid: '1', page_key: '/p' } }))

        expect(response.status).toBe(403)
      },
    )

    it.each(['/rpc/public/notifications/list', '/rpc/admin/analytics/overview'])(
      'keeps the CSRF guard in front of the viewer-session public surface and the admin surface %s',
      async (path) => {
        const app = makeApiApp()

        const response = await rpcNoCsrf(app, path, JSON.stringify({ json: {} }))

        expect(response.status).toBe(403)
      },
    )

    it('serves RUM status without CSRF and keeps setup restore protected', async () => {
      const app = makeApiApp()
      expect((await rpcNoCsrf(app, '/rpc/public/observability/rumStatus', JSON.stringify({ json: {} }))).status).toBe(
        200,
      )
      expect((await rpcNoCsrf(app, '/rpc/account/setup/restore', JSON.stringify({ json: {} }))).status).toBe(403)
    })

    it('lets the explicit no-CSRF media/download procedures reach their auth guards', async () => {
      const app = makeApiApp()
      const music = await app.request(
        '/rpc/admin/music/proxyCover?data=%7B%22json%22%3A%7B%22source%22%3A%22netease%22%2C%22sourceId%22%3A%221%22%7D%7D',
      )
      const backup = await app.request('/rpc/admin/backup/download?data=%7B%22json%22%3A%7B%22key%22%3A%221%22%7D%7D')
      expect(music.status).toBe(401)
      expect(backup.status).toBe(401)
    })

    it('lets the anonymous device beacon through CSRF without weakening schema validation', async () => {
      const app = makeApiApp()
      const response = await rpcNoCsrf(
        app,
        '/rpc/public/analytics/recordDeviceEnv',
        JSON.stringify({ json: { eventId: 'invalid', hasStatic: false } }),
      )
      expect(response.status).toBe(400)
    })

    it.each(['/rpc/public/notifications/list', '/rpc/admin/analytics/overview'])(
      'keeps the auth guard on the canonical viewer-session public surface and the admin surface %s behind a valid CSRF token',
      async (path) => {
        const app = makeApiApp()

        const response = await rpc(app, path, { body: JSON.stringify({ json: {} }) })

        expect(response.status).toBe(401)
      },
    )
  })

  describe('promoted interaction procedures (ADR-0009 §2 adoption step 6)', () => {
    it.each([
      '/rpc/account/likes/increase',
      '/rpc/account/likes/validate',
      '/rpc/account/friends/apply',
      '/rpc/account/notifications/list',
      '/rpc/account/notifications/unreadCount',
      '/rpc/account/newsletter/subscribe',
      '/rpc/account/comments/updateOwn',
      '/rpc/account/comments/requestDeleteOwn',
      '/rpc/account/comments/cancelDeleteOwn',
    ])('no longer matches the pre-promotion account URL %s (404 behind a valid CSRF token)', async (path) => {
      const app = makeApiApp()

      const response = await rpc(app, path, { body: JSON.stringify({ json: {} }) })

      expect(response.status).toBe(404)
    })

    it.each([
      '/rpc/public/likes/increase',
      '/rpc/public/likes/decrease',
      '/rpc/public/friends/apply',
      '/rpc/public/newsletter/subscribe',
    ])('answers the anonymous+CSRF procedure %s with schema validation behind a valid CSRF token', async (path) => {
      const app = makeApiApp()

      const response = await rpc(app, path, { body: JSON.stringify({ json: {} }) })

      expect(response.status).toBe(400)
    })

    it.each([
      '/rpc/public/likes/increase',
      '/rpc/public/likes/decrease',
      '/rpc/public/friends/apply',
      '/rpc/public/newsletter/subscribe',
    ])('still rejects the anonymous+CSRF procedure %s without a CSRF token', async (path) => {
      const app = makeApiApp()

      const response = await rpcNoCsrf(app, path, JSON.stringify({ json: {} }))

      expect(response.status).toBe(403)
    })

    it.each([
      '/rpc/public/notifications/list',
      '/rpc/public/notifications/unreadCount',
      '/rpc/public/comments/updateOwn',
      '/rpc/public/comments/requestDeleteOwn',
      '/rpc/public/comments/cancelDeleteOwn',
    ])(
      'answers the viewer-session procedure %s with the unauthorized error behind a valid CSRF token',
      async (path) => {
        const app = makeApiApp()

        const response = await rpc(app, path, { body: JSON.stringify({ json: {} }) })

        expect(response.status).toBe(401)
      },
    )

    it.each([
      '/rpc/public/notifications/list',
      '/rpc/public/notifications/unreadCount',
      '/rpc/public/comments/updateOwn',
      '/rpc/public/comments/requestDeleteOwn',
      '/rpc/public/comments/cancelDeleteOwn',
    ])('still rejects the viewer-session procedure %s without a CSRF token', async (path) => {
      const app = makeApiApp()

      const response = await rpcNoCsrf(app, path, JSON.stringify({ json: {} }))

      expect(response.status).toBe(403)
    })
  })
})
