import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { flushAuditLog } from '@/server/domains/audit/repos/batcher'
import { adminWebmentionsRouter } from '@/server/http/controllers/admin/webmentions.controller'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'
import { insertWebmention } from '@/server/infra/db/operations/webmention'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { auditLog } from '@/server/infra/db/schema/config'
import { user } from '@/server/infra/db/schema/user'
import { webmention } from '@/server/infra/db/schema/webmention'

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  await clearAllTables(db)
})

// audit_log.actor_id references user.id — the admin actor must be a
// real row or the audit insert dead-letters on the FK.
async function seedAdmin(): Promise<bigint> {
  const rows = await db
    .insert(user)
    .values({
      name: 'Admin',
      email: `admin-${Date.now()}-${Math.random()}@example.com`,
      password: 'hashed',
      role: 'admin',
    })
    .returning({ id: user.id })
  return rows[0]!.id
}

function adminCtx(adminId: bigint) {
  return makeAuthedCtx({ userId: adminId.toString(), role: 'admin', db, pool })
}

async function seedMention(status: 'pending' | 'approved' | 'rejected', slug = 'wm-target'): Promise<bigint> {
  const row = await insertWebmention(db, {
    sourceUrl: `https://sender.example/${slug}-${status}`,
    targetUrl: `https://example.com/posts/${slug}/`,
    status,
    targetType: 'post',
    targetOwnerId: 1n,
    fetchedAt: new Date(),
    authorName: 'Jane Doe',
    title: `Mention ${status}`,
    summary: null,
    rawPayload: { source: `https://sender.example/${slug}-${status}`, target: `https://example.com/posts/${slug}/` },
  })
  return row.id
}

describe('integration / admin webmentions moderation', () => {
  it('lists mentions with status filter, totals and status counts', async () => {
    const adminId = await seedAdmin()
    await seedMention('pending')
    await seedMention('approved')
    await seedMention('rejected')

    const all = await call(adminWebmentionsRouter.loadAll, { offset: 0, limit: 10 }, { context: adminCtx(adminId) })
    expect(all.total).toBe(3)
    expect(all.hasMore).toBe(false)
    expect(all.statusCounts).toEqual({ all: 3, pending: 1, approved: 1, rejected: 1 })
    // Newest first.
    expect(all.mentions.map((m) => m.status)).toEqual(['rejected', 'approved', 'pending'])
    const wire = all.mentions[2]!
    expect(wire.id).toMatch(/^\d+$/)
    expect(wire.targetType).toBe('post')
    expect(wire.authorName).toBe('Jane Doe')
    expect(wire.createdAt).toContain('T')

    const pendingOnly = await call(
      adminWebmentionsRouter.loadAll,
      { offset: 0, limit: 10, status: 'pending' },
      { context: adminCtx(adminId) },
    )
    expect(pendingOnly.total).toBe(1)
    expect(pendingOnly.mentions).toHaveLength(1)
    expect(pendingOnly.mentions[0]!.status).toBe('pending')
    // Status counts always describe the whole table.
    expect(pendingOnly.statusCounts.all).toBe(3)
  })

  it('paginates with offset/limit and reports hasMore', async () => {
    const adminId = await seedAdmin()
    await seedMention('pending', 'a')
    await seedMention('pending', 'b')
    await seedMention('pending', 'c')

    const page1 = await call(adminWebmentionsRouter.loadAll, { offset: 0, limit: 2 }, { context: adminCtx(adminId) })
    expect(page1.mentions).toHaveLength(2)
    expect(page1.total).toBe(3)
    expect(page1.hasMore).toBe(true)

    const page2 = await call(adminWebmentionsRouter.loadAll, { offset: 2, limit: 2 }, { context: adminCtx(adminId) })
    expect(page2.mentions).toHaveLength(1)
    expect(page2.hasMore).toBe(false)
  })

  it('requires an admin role', async () => {
    await expect(
      call(
        adminWebmentionsRouter.loadAll,
        { offset: 0, limit: 10 },
        { context: makeAuthedCtx({ role: 'visitor', db, pool }) },
      ),
    ).rejects.toThrow()
  })
})

describe('integration / admin webmentions approve + reject', () => {
  beforeEach(() => {
    initAllBatchers(pool, db)
  })

  afterEach(async () => {
    // Flush BEFORE reset (and before the next clearAllTables wipes the
    // seeded admin) — otherwise the batcher's 500ms timer can fire into
    // the next test and dead-letter the buffered events on the
    // audit_log.actor_id FK.
    await flushAuditLog()
    resetAllBatchers()
  })

  async function auditRowsFor(action: string) {
    await flushAuditLog()
    return db.select().from(auditLog).where(eq(auditLog.action, action))
  }

  it('approves a pending mention and records the audit event', async () => {
    const adminId = await seedAdmin()
    const id = await seedMention('pending')
    await call(adminWebmentionsRouter.approve, { id: id.toString() }, { context: adminCtx(adminId) })

    const rows = await db.select().from(webmention).where(eq(webmention.id, id))
    expect(rows[0]!.status).toBe('approved')
    expect(rows[0]!.moderatedAt).not.toBeNull()

    const audits = await auditRowsFor('webmention_approved')
    expect(audits).toHaveLength(1)
    expect(audits[0]!.resourceType).toBe('webmention')
    expect(audits[0]!.resourceId).toBe(id.toString())
  })

  it('rejects a pending mention and records the audit event', async () => {
    const adminId = await seedAdmin()
    const id = await seedMention('pending')
    await call(adminWebmentionsRouter.reject, { id: id.toString() }, { context: adminCtx(adminId) })

    const rows = await db.select().from(webmention).where(eq(webmention.id, id))
    expect(rows[0]!.status).toBe('rejected')

    const audits = await auditRowsFor('webmention_rejected')
    expect(audits).toHaveLength(1)
    expect(audits[0]!.resourceType).toBe('webmention')
  })

  it('is idempotent on repeated moderation and 404s on unknown ids', async () => {
    const adminId = await seedAdmin()
    const id = await seedMention('pending')
    const ctx = adminCtx(adminId)
    await call(adminWebmentionsRouter.approve, { id: id.toString() }, { context: ctx })
    await call(adminWebmentionsRouter.approve, { id: id.toString() }, { context: ctx })
    const rows = await db.select().from(webmention).where(eq(webmention.id, id))
    expect(rows[0]!.status).toBe('approved')

    await expect(call(adminWebmentionsRouter.approve, { id: '999999' }, { context: ctx })).rejects.toThrow()
  })
})
