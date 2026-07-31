import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { getDatabaseHandle } from '@/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@/server/domains/audit/services/batcher'
import { adminTagsRouter } from '@/server/http/controllers/admin/tags.controller'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'
import { tag } from '@/server/infra/db/schema/taxonomy'
import { user } from '@/server/infra/db/schema/user'

// adminTagsRouter against the real engine: the taxonomy service runs
// against real tag rows (uniqueness guards, slug resolution, block-while-
// referenced deletion), and writes record real audit rows flushed from
// the batcher.
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

async function seedTag(name: string, slug: string): Promise<number> {
  const [row] = await db.insert(tag).values({ name, slug }).returning({ id: tag.id })
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

describe('adminTagsRouter.list', () => {
  it('returns seeded tags matching the query with total and hasMore', async () => {
    const id = await seedTag('Tag A', 'tag-a')

    const res = await call(adminTagsRouter.list, { q: 'Tag', offset: 0, limit: 20 }, { context: adminCtx() })
    expect(res.total).toBe(1)
    expect(res.hasMore).toBe(false)
    expect(res.tags).toHaveLength(1)
    expect(res.tags[0]).toMatchObject({ id: String(id), name: 'Tag A', slug: 'tag-a', postCount: 0 })
  })
})

describe('adminTagsRouter.upsert', () => {
  it('creates a real tag row and returns its DTO', async () => {
    const res = await call(adminTagsRouter.upsert, { name: 'Tag B' }, { context: adminCtx() })

    expect(res.tag).toMatchObject({ name: 'Tag B', slug: 'tag-b', postCount: 0 })
    const rows = await db.select().from(tag).where(eq(tag.name, 'Tag B'))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.slug).toBe('tag-b')
  })
})

describe('adminTagsRouter.delete', () => {
  it('throws NOT_FOUND for a missing tag id', async () => {
    await expect(call(adminTagsRouter.delete, { id: '999' }, { context: adminCtx() })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('removes the row and resolves to undefined on success', async () => {
    const id = await seedTag('Tag C', 'tag-c')

    const res = await call(adminTagsRouter.delete, { id: String(id) }, { context: adminCtx() })
    expect(res).toBeUndefined()

    const remaining = await db.select().from(tag).where(eq(tag.id, id))
    expect(remaining).toHaveLength(0)
  })
})
