import { call } from '@orpc/server'
import { asc, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { getDatabaseHandle } from '@/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@/server/domains/audit/services/batcher'
import { adminCategoriesRouter } from '@/server/http/controllers/admin/categories.controller'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'
import { category } from '@/server/infra/db/schema/taxonomy'
import { user } from '@/server/infra/db/schema/user'

// adminCategoriesRouter against the real engine; audit rows flushed from the batcher.
const db = getTestDb()

let adminId = 0

// audit_log.actor_id references user.id: the editor must be a real row for the FK.
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

async function seedCategory(name: string, sortOrder = 0): Promise<number> {
  const [row] = await db
    .insert(category)
    .values({ name, slug: name.toLowerCase(), cover: `https://example.com/${name.toLowerCase()}.jpg`, sortOrder })
    .returning({ id: category.id })
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

describe('adminCategoriesRouter.list', () => {
  it('returns seeded categories matching the query', async () => {
    const id = await seedCategory('Tech')

    const res = await call(adminCategoriesRouter.list, { q: 'tech' }, { context: adminCtx() })
    expect(res.categories).toHaveLength(1)
    expect(res.total).toBe(1)
    expect(res.categories[0]).toMatchObject({ id: String(id), name: 'Tech', slug: 'tech', postCount: 0 })
  })

  it('works with empty input', async () => {
    const res = await call(adminCategoriesRouter.list, {}, { context: adminCtx() })
    expect(res.categories).toHaveLength(0)
    expect(res.total).toBe(0)
  })
})

describe('adminCategoriesRouter.upsert', () => {
  it('creates a real category row and returns its DTO', async () => {
    const res = await call(
      adminCategoriesRouter.upsert,
      { name: 'Tech', cover: 'https://example.com/cover.jpg' },
      { context: adminCtx() },
    )

    expect(res.category).toMatchObject({ name: 'Tech', slug: 'tech', cover: 'https://example.com/cover.jpg' })
    const rows = await db.select().from(category).where(eq(category.name, 'Tech'))
    expect(rows).toHaveLength(1)
  })
})

describe('adminCategoriesRouter.delete', () => {
  it('removes the row and resolves to undefined on success', async () => {
    const id = await seedCategory('Tech')

    const res = await call(adminCategoriesRouter.delete, { id: String(id) }, { context: adminCtx() })
    expect(res).toBeUndefined()

    const remaining = await db.select().from(category).where(eq(category.id, id))
    expect(remaining).toHaveLength(0)
  })

  it('throws NOT_FOUND for a missing category id', async () => {
    await expect(call(adminCategoriesRouter.delete, { id: '999' }, { context: adminCtx() })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('adminCategoriesRouter.reorder', () => {
  it('rewrites sort_order to the submitted order', async () => {
    const alpha = await seedCategory('Alpha', 0)
    const beta = await seedCategory('Beta', 1)
    const gamma = await seedCategory('Gamma', 2)

    const res = await call(
      adminCategoriesRouter.reorder,
      { orderedIds: [String(gamma), String(alpha), String(beta)] },
      { context: adminCtx() },
    )

    expect(res.categories.map((c) => c.id)).toEqual([String(gamma), String(alpha), String(beta)])
    expect(res.categories.map((c) => c.sortOrder)).toEqual([0, 1, 2])

    const rows = await db.select().from(category).orderBy(asc(category.sortOrder))
    expect(rows.map((row) => row.id)).toEqual([gamma, alpha, beta])
  })
})
