import type { Env } from '@kobato/server/http/hono-env'

import { getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makeRequestContext } from '@kobato/server/tests/utils/request-context'
import { adminUser, makeSession } from '@kobato/server/tests/utils/session'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

const db = getTestDb()
const CSRF = 'legacy-rpc-csrf-token'

const { onErrorHandler } = await import('@kobato/server/http/errors')
const { createApiApp } = await import('@kobato/server/http/app')

function makeApiApp(user?: ReturnType<typeof adminUser>) {
  const rc = makeRequestContext({ db, session: makeSession({ csrfToken: CSRF }), ...(user ? { user } : {}) })
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

describe('legacy /rpc/* URL adapter (real HTTP)', () => {
  it('answers content.bootstrap identically on the legacy and the canonical path', async () => {
    const app = makeApiApp()

    const legacy = await rpc(app, '/rpc/content/bootstrap')
    const canonical = await rpc(app, '/rpc/public/content/bootstrap')

    expect(legacy.status).toBe(200)
    expect(canonical.status).toBe(200)
    const legacyJson = (await legacy.json()) as { json: Record<string, unknown> }
    const canonicalJson = (await canonical.json()) as { json: Record<string, unknown> }
    expect(legacyJson.json.currentUser).toEqual(canonicalJson.json.currentUser)
    expect(legacyJson.json.csrfToken).toBe(canonicalJson.json.csrfToken)
  })

  it('keeps the authed guard identical for legacy and canonical notifications.list', async () => {
    const app = makeApiApp()

    const legacy = await rpc(app, '/rpc/notifications/list', {
      body: JSON.stringify({ json: { tab: 'all', limit: 20 } }),
    })
    const canonical = await rpc(app, '/rpc/account/notifications/list', {
      body: JSON.stringify({ json: { tab: 'all', limit: 20 } }),
    })

    expect(legacy.status).toBe(401)
    expect(canonical.status).toBe(401)
  })

  it('routes legacy comments procedures onto their split public/account homes', async () => {
    const app = makeApiApp()

    const loadInput = JSON.stringify({ json: { page_key: '/p', offset: 0 } })
    const publicLegacy = await rpc(app, '/rpc/comments/loadComments', { body: loadInput })
    const publicCanonical = await rpc(app, '/rpc/public/comments/loadComments', { body: loadInput })
    expect(publicLegacy.status).toBe(publicCanonical.status)
    await expect(publicLegacy.text()).resolves.toBe(await publicCanonical.text())

    const accountLegacy = await rpc(app, '/rpc/comments/myCounts')
    const accountCanonical = await rpc(app, '/rpc/account/comments/myCounts')
    expect(accountLegacy.status).toBe(401)
    expect(accountCanonical.status).toBe(401)
  })

  it('keeps the CSRF guard in front of the rewrite for legacy and canonical likes', async () => {
    const app = makeApiApp()

    const legacy = await rpc(app, '/rpc/likes/increase', {
      headers: { 'x-csrf-token': 'wrong-token' },
      body: JSON.stringify({ json: { key: 'post:1' } }),
    })
    const canonical = await rpc(app, '/rpc/account/likes/increase', {
      headers: { 'x-csrf-token': 'wrong-token' },
      body: JSON.stringify({ json: { key: 'post:1' } }),
    })

    expect(legacy.status).toBe(403)
    expect(canonical.status).toBe(403)
  })

  it('delivers the legacy /rpc/analytics/* alias to the same guarded admin procedure as the canonical path', async () => {
    const app = makeApiApp(adminUser())
    const input = JSON.stringify({ json: { search: '' } })

    const legacy = await rpc(app, '/rpc/analytics/overview', { body: input })
    const canonical = await rpc(app, '/rpc/admin/analytics/overview', { body: input })

    // Both URLs must reach the SAME author/admin-guarded procedure (never fall through unmatched): identical
    // status + payload. As admin, a 401/403 would mean the guard denied us; without the DuckDB sidecar this
    // environment answers with the same translated error on both paths, a 200 pair simply means the engine was
    // available — either way the alias is proven live behind the guard.
    expect(legacy.status).not.toBe(404)
    expect(canonical.status).not.toBe(404)
    expect(legacy.status).not.toBe(401)
    expect(legacy.status).not.toBe(403)
    expect(legacy.status).toBe(canonical.status)
    await expect(legacy.text()).resolves.toBe(await canonical.text())
  })

  it('leaves unmatched legacy-shaped paths unmatched', async () => {
    const app = makeApiApp()

    const response = await rpc(app, '/rpc/content/notAProcedure')

    expect(response.status).toBe(404)
  })

  describe('anonymous public reads vs CSRF (no x-csrf-token header at all)', () => {
    async function rpcNoCsrf(app: ReturnType<typeof makeApiApp>, path: string, body = '{}'): Promise<Response> {
      return app.request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      })
    }

    it('serves content.bootstrap on both canonical and legacy paths without any CSRF header', async () => {
      const app = makeApiApp()

      const canonical = await rpcNoCsrf(app, '/rpc/public/content/bootstrap')
      const legacy = await rpcNoCsrf(app, '/rpc/content/bootstrap')

      expect(canonical.status).toBe(200)
      expect(legacy.status).toBe(200)
    })

    it.each([
      '/rpc/public/comments/getRaw',
      '/rpc/comments/getRaw',
      '/rpc/public/comments/replyComment',
      '/rpc/comments/replyComment',
      '/rpc/public/comments/myComments',
    ])('still rejects the token read / comment mutation %s with CSRF 403', async (path) => {
      const app = makeApiApp()

      const response = await rpcNoCsrf(app, path, JSON.stringify({ json: { rid: '1', page_key: '/p' } }))

      expect(response.status).toBe(403)
    })

    it.each([
      '/rpc/account/notifications/list',
      '/rpc/notifications/list',
      '/rpc/admin/analytics/overview',
      '/rpc/analytics/overview',
    ])('keeps the CSRF guard in front of the anonymous account/admin surface %s', async (path) => {
      const app = makeApiApp()

      const response = await rpcNoCsrf(app, path, JSON.stringify({ json: {} }))

      expect(response.status).toBe(403)
    })
  })
})
