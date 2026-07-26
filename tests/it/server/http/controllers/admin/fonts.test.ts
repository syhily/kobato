import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FontRow } from '@/server/infra/db/schema/font'

import { clearAllTables } from '#/_helpers/integration-db'
import { makeAuthedCtx, makePublicCtx } from '#/_helpers/mock-ctx'
import { flushAuditLog } from '@/server/domains/audit/services/batcher'
import { adminFontsRouter } from '@/server/http/controllers/admin/fonts.controller'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { auditLog, setting } from '@/server/infra/db/schema/config'
import { font } from '@/server/infra/db/schema/font'
import { user } from '@/server/infra/db/schema/user'

// Mock only the storage boundary so `delete` never touches the local/S3
// backends; the DB, settings, and audit pipelines stay real.
vi.mock('@/server/domains/fonts/storage', () => ({
  deleteFontPackage: vi.fn(async () => undefined),
}))

// Section-change dispatch (backup/audit reschedule, mail transport
// invalidation) is covered by the unit tests; keep it out of these
// persistence-focused cases.
vi.mock('@/server/domains/settings/services/section-changes', () => ({
  SECTION_CHANGE_HANDLERS: new Map(),
}))

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  await clearAllTables(db)
  initAllBatchers(pool, db)
})

afterEach(() => {
  resetAllBatchers()
})

let seq = 0

async function seedFont(overrides: Partial<typeof font.$inferInsert> = {}): Promise<FontRow> {
  const hash = overrides.hash ?? `hash-${++seq}`
  const [row] = await db
    .insert(font)
    .values({
      familyName: 'Test Sans',
      sourceName: 'test-sans.ttf',
      hash,
      cssKey: `fonts/${hash}/result.css`,
      storageDriver: 'local',
      chunkCount: 3,
      totalBytes: 4096,
      etag: 'etag-1',
      ...overrides,
    })
    .returning()
  return row
}

// audit_log.actor_id references user.id, so the admin viewer must be a real
// row for the batched audit insert to survive the FK.
async function seedAdmin(): Promise<bigint> {
  const [row] = await db
    .insert(user)
    .values({ name: 'Admin', email: `admin-${++seq}@example.com`, password: 'hashed', role: 'admin' })
    .returning({ id: user.id })
  return row.id
}

function adminCtx(userId: bigint) {
  return makeAuthedCtx({ userId: String(userId), role: 'admin', db, pool })
}

describe('adminFontsRouter.list', () => {
  it('returns seeded fonts as DTOs', async () => {
    const admin = await seedAdmin()
    const seeded = await seedFont()

    const res = await call(adminFontsRouter.list, {}, { context: adminCtx(admin) })

    expect(res.fonts).toHaveLength(1)
    expect(res.fonts[0]).toMatchObject({
      id: seeded.id,
      familyName: seeded.familyName,
      hash: seeded.hash,
      storageDriver: 'local',
    })
    expect(typeof res.fonts[0]!.createdAt).toBe('string')
  })
})

describe('adminFontsRouter.delete', () => {
  it('returns the deleted DTO and records a font_deleted audit row', async () => {
    const admin = await seedAdmin()
    const seeded = await seedFont()

    const res = await call(adminFontsRouter.delete, { fontId: seeded.id }, { context: adminCtx(admin) })

    expect(res.font.id).toBe(seeded.id)
    expect(res.font.familyName).toBe(seeded.familyName)
    const remaining = await db.select().from(font).where(eq(font.id, seeded.id))
    expect(remaining).toHaveLength(0)

    await flushAuditLog()
    const rows = await db.select().from(auditLog).where(eq(auditLog.action, 'font_deleted'))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.resourceType).toBe('font')
    expect(rows[0]!.resourceId).toBe(seeded.id)
    expect(rows[0]!.actorId).toBe(admin)
  })

  it('surfaces CONFLICT to the caller when a slot still references the font', async () => {
    const admin = await seedAdmin()
    const seeded = await seedFont()
    await call(adminFontsRouter.setSlot, { slot: 'global', fontIds: [seeded.id] }, { context: adminCtx(admin) })

    await expect(
      call(adminFontsRouter.delete, { fontId: seeded.id }, { context: adminCtx(admin) }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})

describe('adminFontsRouter.setSlot', () => {
  it('updates the fonts settings row and records a font_slot_updated audit row', async () => {
    const admin = await seedAdmin()
    const seeded = await seedFont()

    await call(adminFontsRouter.setSlot, { slot: 'post', fontIds: [seeded.id] }, { context: adminCtx(admin) })

    const settingsRows = await db.select().from(setting).where(eq(setting.scope, 'blog.fonts'))
    expect(settingsRows[0]?.data).toMatchObject({ post: [seeded.id] })

    await flushAuditLog()
    const rows = await db.select().from(auditLog).where(eq(auditLog.action, 'font_slot_updated'))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.resourceType).toBe('font')
    expect(rows[0]!.resourceId).toBe('post')
  })
})

describe('adminFontsRouter — auth gate', () => {
  it('rejects unauthenticated and non-admin callers', async () => {
    await expect(call(adminFontsRouter.list, {}, { context: makePublicCtx({ db, pool }) })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
    await expect(
      call(adminFontsRouter.list, {}, { context: makeAuthedCtx({ role: 'visitor', db, pool }) }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
