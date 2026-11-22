import type { Env } from '@kobato/server/http/hono-env'

import { createKobatoPublicClient } from '@kobato/api/client/create-client'
import { getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makeRequestContext } from '@kobato/server/tests/utils/request-context'
import { makeSession } from '@kobato/server/tests/utils/session'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

const db = getTestDb()

const { onErrorHandler } = await import('@kobato/server/http/errors')
const { createApiApp } = await import('@kobato/server/http/app')
const { ensureCsrfToken } = await import('@kobato/server/domains/auth/csrf')

function makeApiApp() {
  // The production request-context perimeter creates an anonymous session and pre-seeds its CSRF token before the
  // /rpc mount — the bootstrap procedure asserts that invariant. The headless CLIENT below still sends no cookie and
  // no x-csrf-token header; only the server-side session object mirrors the perimeter's work.
  const session = makeSession()
  ensureCsrfToken(session)
  const rc = makeRequestContext({ db, session })
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('requestContext', rc as unknown as Env['Variables']['requestContext'])
    await next()
  })
  app.route('/', createApiApp())
  app.onError(onErrorHandler)
  return app
}

describe('createKobatoPublicClient against the real Hono app (external headless consumer)', () => {
  it('boots content.bootstrap bare — no cookie, no CSRF header, no ambient state', async () => {
    const app = makeApiApp()
    const client = createKobatoPublicClient({
      url: 'http://localhost/rpc',
      fetch: async (request) => app.request(request),
    })

    const boot = await client.content.bootstrap()

    expect(boot.currentUser).toBeNull()
    expect(boot.blogSettings).toBeTypeOf('object')
    expect(boot.csrfToken).toEqual(expect.any(String))
  })

  it('reads a listing through the same bare transport', async () => {
    const app = makeApiApp()
    const client = createKobatoPublicClient({
      url: 'http://localhost/rpc',
      fetch: async (request) => app.request(request),
    })

    const home = await client.content.home({})

    expect(home.kind).toBe('ok')
    if (home.kind !== 'ok') {
      throw new Error(`expected an ok listing, got ${home.kind}`)
    }
    expect(home.etag).toEqual(expect.any(String))
  })
})
