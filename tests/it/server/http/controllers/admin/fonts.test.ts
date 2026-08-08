import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { FontRow } from '@/server/infra/db/schema/font'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeMemoryBackend } from '#/_helpers/memory-storage'
import { makeAuthedCtx, makePublicCtx } from '#/_helpers/mock-ctx'
import { getDatabaseHandle } from '@/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@/server/domains/audit/services/batcher'
import { __clearSectionChangeHandlersForTests } from '@/server/domains/settings/services/section-changes'
import { adminFontsRouter } from '@/server/http/controllers/admin/fonts.controller'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'
import { auditLog, setting } from '@/server/infra/db/schema/config'
import { font } from '@/server/infra/db/schema/font'
import { user } from '@/server/infra/db/schema/user'
import { __resetStorageBackendsForTests, __setStorageBackendForTests } from '@/server/infra/storage/registry'

// No mocks: everything runs real against the shared in-memory storage
// backend (seeded fonts carry storageDriver 'local', matching its driver).
const memory = makeMemoryBackend({ driver: 'local' })

// Section-change dispatch is unit-covered; keep it out of these cases.
const db = getTestDb()

beforeEach(async () => {
  __setStorageBackendForTests('local', memory.backend)
  __clearSectionChangeHandlersForTests()
  await clearAllTables(db)
  initAllBatchers(getDatabaseHandle())
})

afterEach(async () => {
  __resetStorageBackendsForTests()
  memory.reset()
  // Flush BEFORE dropping the batcher: an armed flush timer leaks stale events into the next test.
  await flushAuditLog()
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

// audit_log.actor_id references user.id: the admin viewer must be a real row.
async function seedAdmin(): Promise<number> {
  const [row] = await db
    .insert(user)
    .values({ name: 'Admin', email: `admin-${++seq}@example.com`, password: 'hashed', role: 'admin' })
    .returning({ id: user.id })
  return row.id
}

function adminCtx(userId: number) {
  return makeAuthedCtx({ userId: String(userId), role: 'admin', db })
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
  it('returns the deleted DTO, removes the storage package, and records a font_deleted audit row', async () => {
    const admin = await seedAdmin()
    const seeded = await seedFont()
    // Mirror putFont's output: result.css + the woff2 chunks.
    const packageFiles = ['result.css', 'chunk-0.woff2', 'chunk-1.woff2', 'chunk-2.woff2']
    for (const name of packageFiles) {
      memory.store.set(`fonts/${seeded.hash}/${name}`, {
        body: Buffer.from(name),
        contentType: 'application/octet-stream',
      })
    }

    const res = await call(adminFontsRouter.delete, { fontId: seeded.id }, { context: adminCtx(admin) })

    expect(res.font.id).toBe(seeded.id)
    expect(res.font.familyName).toBe(seeded.familyName)
    const remaining = await db.select().from(font).where(eq(font.id, seeded.id))
    expect(remaining).toHaveLength(0)

    const packageKeys = packageFiles.map((name) => `fonts/${seeded.hash}/${name}`)
    expect(memory.deletedKeys).toEqual(expect.arrayContaining(packageKeys))
    for (const key of packageKeys) {
      expect(memory.store.has(key)).toBe(false)
    }

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
    await expect(call(adminFontsRouter.list, {}, { context: makePublicCtx({ db }) })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
    await expect(
      call(adminFontsRouter.list, {}, { context: makeAuthedCtx({ role: 'visitor', db }) }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
