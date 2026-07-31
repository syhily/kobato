import { call } from '@orpc/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { auditLog } from '@/server/infra/db/schema/config'
import { user } from '@/server/infra/db/schema/user'

// auditLogRouter against the real engine: the four query functions run
// against real audit_log/user rows (pagination math, actor join, CSV
// assembly, and the 10k export cap are all exercised for real). Only the
// Shiki-based syntax highlighter stays mocked — its WASM boot is heavy
// and the unit tests already cover it.
vi.mock('@/server/domains/audit/highlight', () => ({
  highlightAuditLogDetails: vi.fn((details: string | null) => Promise.resolve(details)),
}))

const { auditLogRouter } = await import('@/server/http/controllers/admin/audit.controller')

const db = getTestDb()

const ctx = makeAuthedCtx({ role: 'admin', db })

let seq = 0

async function seedUser(name: string): Promise<number> {
  const [row] = await db
    .insert(user)
    .values({ name, email: `user-${++seq}@example.com`, password: 'hashed', role: 'admin' })
    .returning({ id: user.id })
  return row.id
}

async function seedAuditRows(count: number, overrides: Partial<typeof auditLog.$inferInsert> = {}): Promise<void> {
  const values = Array.from({ length: count }, (_, i) => ({
    action: 'login',
    resourceType: 'session',
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
    ...overrides,
  }))
  // node:sqlite caps bound variables per statement — chunk the insert.
  for (let i = 0; i < values.length; i += 500) {
    await db.insert(auditLog).values(values.slice(i, i + 500))
  }
}

beforeEach(async () => {
  await clearAllTables(db)
})

describe('auditLogRouter.list', () => {
  it('returns items with hasMore=false when all rows fit in the limit', async () => {
    await seedAuditRows(1)

    const result = await call(auditLogRouter.list, { offset: 0, limit: 20 }, { context: ctx })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({ action: 'login', resourceType: 'session', actorName: null })
    expect(result.total).toBe(1)
    expect(result.hasMore).toBe(false)
  })

  it('returns hasMore=true when more rows exist beyond the limit', async () => {
    await seedAuditRows(25)

    const result = await call(auditLogRouter.list, { offset: 0, limit: 20 }, { context: ctx })
    expect(result.items).toHaveLength(20)
    expect(result.total).toBe(25)
    expect(result.hasMore).toBe(true)
  })

  it('joins the actor name from the user table', async () => {
    const alice = await seedUser('Alice')
    await seedAuditRows(1, { actorId: alice, actorRole: 'admin' })

    const result = await call(auditLogRouter.list, { offset: 0, limit: 20 }, { context: ctx })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({ actorId: String(alice), actorName: 'Alice', actorRole: 'admin' })
  })

  it('rejects an invalid actorId with BAD_REQUEST', async () => {
    await expect(
      call(auditLogRouter.list, { offset: 0, limit: 20, actorId: 'not-valid' }, { context: ctx }),
    ).rejects.toThrow(/actorId/)
  })
})

describe('auditLogRouter.exportCsv', () => {
  it('returns a UTF-8 BOM CSV with headers', async () => {
    await seedAuditRows(1, { ipAddress: '127.0.0.1' })

    const csv = await call(auditLogRouter.exportCsv, { includeFullIp: false }, { context: ctx })
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain(
      'id,action,actorId,actorName,actorRole,resourceType,resourceId,details,ipAddress,userAgentMasked,createdAt',
    )
    expect(csv).toContain('1,login')
  })

  it('includes full IP when requested', async () => {
    await seedAuditRows(1, { ipAddress: '127.0.0.1' })

    const csv = await call(auditLogRouter.exportCsv, { includeFullIp: true }, { context: ctx })
    expect(csv).toContain('127.0.0.1')
  })

  it('rejects export when row count exceeds the limit', async () => {
    await seedAuditRows(10_001)

    await expect(call(auditLogRouter.exportCsv, { includeFullIp: false }, { context: ctx })).rejects.toThrow(/10000/)
  })

  it('rejects an invalid actorId with BAD_REQUEST', async () => {
    await expect(
      call(auditLogRouter.exportCsv, { actorId: 'not-valid', includeFullIp: false }, { context: ctx }),
    ).rejects.toThrow(/actorId/)
  })
})

describe('auditLogRouter.actors', () => {
  it('returns distinct actors as DTOs ordered by name', async () => {
    const bob = await seedUser('Bob')
    const alice = await seedUser('Alice')
    await seedAuditRows(1, { actorId: bob })
    await seedAuditRows(2, { actorId: alice })

    const result = await call(auditLogRouter.actors, {}, { context: ctx })
    expect(result).toEqual([
      { actorId: String(alice), actorName: 'Alice', email: expect.any(String) },
      { actorId: String(bob), actorName: 'Bob', email: expect.any(String) },
    ])
  })
})
