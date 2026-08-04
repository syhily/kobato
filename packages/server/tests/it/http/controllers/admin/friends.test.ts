import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'

import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@kobato/server/domains/audit/services/batcher'
import { adminFriendsRouter } from '@kobato/server/http/controllers/admin/friends.controller'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry'
import { friend } from '@kobato/server/infra/db/schema/friend'
import { user } from '@kobato/server/infra/db/schema/user'
import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// adminFriendsRouter against the real engine: the friends service runs
// against real friend rows (homepage soft-uniqueness, visibility
// buckets), and writes record real audit rows flushed from the batcher.
const db = getTestDb()

let adminId = 0

// audit_log.actor_id references user.id, so the editor must be a real
// row for the batched audit insert to survive the FK on flush.
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
