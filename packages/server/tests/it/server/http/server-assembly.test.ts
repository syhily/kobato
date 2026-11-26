import type { ServerType } from '@hono/node-server'
import type { Env } from '@kobato/server/http/hono-env'

import { serve } from '@hono/node-server'
import { createKobatoServerClient } from '@kobato/api/client/create-server-client'
import { sqliteOf } from '@kobato/db/sqlite/database'
import { auditLog } from '@kobato/db/sqlite/schema/config'
import { user as userTable } from '@kobato/db/sqlite/schema/user'
import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@kobato/server/domains/audit/services/batcher'
import { deriveStatelessCsrfToken } from '@kobato/server/domains/auth/csrf'
import { buildSessionWithSid, commitSession } from '@kobato/server/domains/auth/session-storage'
import { createApiApp } from '@kobato/server/http/app'
import { onErrorHandler } from '@kobato/server/http/errors'
import { requestContextMiddleware } from '@kobato/server/http/middlewares/request-context'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry'
import { __resetRateLimitsForTests } from '@kobato/server/infra/rate-limit'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import {
  resetBlogSettingsForTests,
  setBlogSettingsBundleForTests,
  TEST_BLOG_SETTINGS_BUNDLE,
} from '@kobato/settings/tests/utils/blog-settings'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { ORPCError } from '@orpc/contract'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { requestId } from 'hono/request-id'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

let server: ServerType
let rpcUrl: string

beforeAll(async () => {
  const app = new Hono<Env>()
  app.onError(onErrorHandler)
  app.use(requestId())
  app.use(requestContextMiddleware)
  app.route('/', createApiApp())
  const port = await new Promise<number>((resolve) => {
    server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1', overrideGlobalObjects: false }, (info) =>
      resolve(info.port),
    )
  })
  rpcUrl = `http://127.0.0.1:${port}/rpc`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

beforeEach(async () => {
  await clearAllTables(db)
  __resetRateLimitsForTests()
  initAllBatchers(getDatabaseHandle())
  resetBlogSettingsForTests()
})

afterEach(async () => {
  await flushAuditLog()
  await resetAllBatchers()
})

function assemblyClient(inbound: Request, clientAddress?: string) {
  return createKobatoServerClient({ url: rpcUrl, request: inbound, clientAddress })
}

function inboundRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://127.0.0.1/', { headers })
}

async function catchOrpcError(promise: Promise<unknown>): Promise<ORPCError<string, unknown>> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(ORPCError)
  return unsafeCast<ORPCError<string, unknown>>(error)
}

async function seedAdminSession(): Promise<{ cookie: string; userId: number }> {
  const [admin] = await sqliteOf(db)
    .insert(userTable)
    .values({ name: 'Admin', email: 'admin@example.com', password: 'not-a-real-hash', role: 'admin' })
    .returning({ id: userTable.id })
  const setCookie = await commitSession(
    buildSessionWithSid(crypto.randomUUID(), {
      user: {
        id: String(admin!.id),
        name: 'Admin',
        email: 'admin@example.com',
        website: null,
        role: 'admin',
      },
    }),
  )
  return { cookie: setCookie.split(';')[0]!, userId: admin!.id }
}

describe('createKobatoServerClient over a real loopback perimeter', () => {
  it('mints the anonymous __csrf cookie on a public-read RPC and relays it through responseHeaders', async () => {
    const { client, responseHeaders } = assemblyClient(inboundRequest())

    const boot = await client.public.content.bootstrap()

    expect(boot.installState).toBe('noAdmin')
    expect(boot.currentUser).toBeNull()
    const csrfCookies = responseHeaders.getSetCookie().filter((cookie) => cookie.startsWith('__csrf='))
    expect(csrfCookies).toHaveLength(1)
    const cookieValue = csrfCookies[0]!.split(';')[0]!.slice('__csrf='.length)
    expect(cookieValue).toMatch(/^[a-f0-9]{64}$/)
    expect(boot.csrfToken).toBe(deriveStatelessCsrfToken(cookieValue))
  })

  it('forwards the inbound session cookie so bootstrap resolves the viewer', async () => {
    const { cookie, userId } = await seedAdminSession()
    const { client } = assemblyClient(inboundRequest({ cookie }))

    const boot = await client.public.content.bootstrap()

    expect(boot.installState).toBe('installed')
    expect(boot.currentUser).toEqual({ id: String(userId), name: 'Admin', role: 'admin' })
  })

  it('keys perimeter rate limits on the caller-derived clientAddress, not the socket peer', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      rateLimit: { ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit!, resource: { windowSeconds: 60, maxAttempts: 1 } },
    })

    const first = assemblyClient(inboundRequest(), '203.0.113.7')
    await expect(first.client.public.content.archives({})).resolves.toMatchObject({ kind: 'ok' })

    const repeated = assemblyClient(inboundRequest(), '203.0.113.7')
    const throttled = await catchOrpcError(repeated.client.public.content.archives({}))
    expect(throttled.status).toBe(429)

    const freshAddress = assemblyClient(inboundRequest(), '203.0.113.8')
    await expect(freshAddress.client.public.content.archives({})).resolves.toMatchObject({ kind: 'ok' })
  })

  it('rejects a logout without a CSRF token and leaves the session untouched', async () => {
    const { cookie, userId } = await seedAdminSession()
    const { client } = assemblyClient(inboundRequest({ cookie }))

    const rejected = await catchOrpcError(client.account.auth.logout({ redirectTo: '/' }))
    expect(rejected.status).toBe(403)

    const probe = assemblyClient(inboundRequest({ cookie }))
    const boot = await probe.client.public.content.bootstrap()
    expect(boot.currentUser).toEqual({ id: String(userId), name: 'Admin', role: 'admin' })

    await flushAuditLog()
    expect(await sqliteOf(db).select().from(auditLog).where(eq(auditLog.action, 'logout'))).toHaveLength(0)
  })
})
