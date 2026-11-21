import type { Env } from '@kobato/server/http/hono-env'

import { friend } from '@kobato/db/schema/friend'
import { user } from '@kobato/db/schema/user'
import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@kobato/server/domains/audit/services/batcher'
import { createApiApp } from '@kobato/server/http/app'
import { adminFriendsRouter } from '@kobato/server/http/controllers/admin/friends.controller'
import { onErrorHandler } from '@kobato/server/http/errors'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makeAuthedCtx } from '@kobato/server/tests/utils/mock-ctx'
import { makeRequestContext } from '@kobato/server/tests/utils/request-context'
import { adminUser, makeSession } from '@kobato/server/tests/utils/session'
import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

let adminId = 0

async function seedAdmin(): Promise<number> {
  const [row] = await db
    .insert(user)
    .values({ name: 'Admin', email: 'admin@example.com', password: 'hashed', role: 'admin' })
    .returning({ id: user.id })
  return row.id
}

function adminCtx() {
  return makeAuthedCtx({ userId: String(adminId), role: 'admin', db })
}

const CSRF = 'friends-test-csrf-token'

function adminApiApp() {
  const rc = makeRequestContext({
    db,
    session: makeSession({ csrfToken: CSRF, user: adminUser({ id: String(adminId) }) }),
  })
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('requestContext', rc)
    await next()
  })
  app.route('/', createApiApp())
  app.onError(onErrorHandler)
  return app
}

function upsertOverHttp(app: ReturnType<typeof adminApiApp>, input: unknown, csrfToken: string | null = CSRF) {
  return app.request('/rpc/admin/friends/upsert', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(csrfToken === null ? {} : { 'x-csrf-token': csrfToken }),
    },
    body: JSON.stringify({ json: input }),
  })
}

async function seedFriend(website: string, visible: boolean): Promise<number> {
  const slug = website.toLowerCase()
  const [row] = await db
    .insert(friend)
    .values({
      website,
      homepage: `https://${slug}.example.com`,
      poster: `https://${slug}.example.com/poster.jpg`,
      visible,
    })
    .returning({ id: friend.id })
  return row.id
}

beforeEach(async () => {
  await clearAllTables(db)
  initAllBatchers(getDatabaseHandle())
  adminId = await seedAdmin()
})

afterEach(async () => {
  await flushAuditLog()
  resetAllBatchers()
})

describe('adminFriendsRouter.list', () => {
  it('returns only visible friends by default (hidden stay in the pending bucket)', async () => {
    await seedFriend('Example', true)
    await seedFriend('Pending', false)

    const res = await call(adminFriendsRouter.list, {}, { context: adminCtx() })
    expect(res.friends).toHaveLength(1)
    expect(res.friends[0]).toMatchObject({ website: 'Example', visible: true })
    expect(res.total).toBe(1)
    expect(res.hasMore).toBe(false)
  })

  it('returns the pending bucket when visible=false is requested', async () => {
    await seedFriend('Example', true)
    await seedFriend('Pending', false)

    const res = await call(adminFriendsRouter.list, { visible: false }, { context: adminCtx() })
    expect(res.friends).toHaveLength(1)
    expect(res.friends[0]).toMatchObject({ website: 'Pending', visible: false })
    expect(res.total).toBe(1)
  })
})

describe('adminFriendsRouter.upsert', () => {
  it('creates a real friend row and returns its DTO', async () => {
    const res = await call(
      adminFriendsRouter.upsert,
      {
        website: 'Example',
        homepage: 'https://example.com',
        poster: 'https://example.com/poster.jpg',
      },
      { context: adminCtx() },
    )

    expect(res.friend).toMatchObject({ website: 'Example', homepage: 'https://example.com', visible: true })
    const rows = await db.select().from(friend).where(eq(friend.homepage, 'https://example.com'))
    expect(rows).toHaveLength(1)
  })

  it('updates the reported payload with a site-owned poster over real HTTP', async () => {
    const id = await seedFriend('Example', true)
    const app = adminApiApp()

    const res = await upsertOverHttp(app, {
      id: String(id),
      website: '羽忆江南',
      homepage: 'https://lizihao.com',
      poster: '/storage/images/links/yyjn.org.jpg',
      visible: true,
      description: '喜于情，爱于心，言于表',
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { json: { friend: { poster: string; website: string } } }
    expect(body.json.friend).toMatchObject({
      website: '羽忆江南',
      poster: '/storage/images/links/yyjn.org.jpg',
    })
  })

  it('still rejects the same mutation without a CSRF token', async () => {
    const id = await seedFriend('Example', true)
    const app = adminApiApp()

    const res = await upsertOverHttp(
      app,
      {
        id: String(id),
        website: 'Example',
        homepage: 'https://example.example.com',
        poster: '/storage/images/links/example.jpg',
      },
      null,
    )

    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: { message: string } }
    expect(body.error.message).toBe('安全校验失败，请刷新页面后重试。')
  })
})

describe('adminFriendsRouter.delete', () => {
  it('removes the row and resolves to undefined on success', async () => {
    const id = await seedFriend('Example', true)

    const res = await call(adminFriendsRouter.delete, { id: String(id) }, { context: adminCtx() })
    expect(res).toBeUndefined()

    const remaining = await db.select().from(friend).where(eq(friend.id, id))
    expect(remaining).toHaveLength(0)
  })

  it('throws NOT_FOUND for a missing friend id', async () => {
    await expect(call(adminFriendsRouter.delete, { id: '999' }, { context: adminCtx() })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})
