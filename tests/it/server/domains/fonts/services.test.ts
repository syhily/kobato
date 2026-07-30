import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { FontRow } from '@/server/infra/db/schema/font'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { deleteFont, setFontSlot } from '@/server/domains/fonts/services/mutate'
import { deleteFontPackage } from '@/server/domains/fonts/storage'
import { setting } from '@/server/infra/db/schema/config'
import { font } from '@/server/infra/db/schema/font'
import { DomainError } from '@/server/infra/http/errors'

// The storage mock is the ONLY mock at the module boundary — DB and settings
// stay real, which is the point of this coverage. `deleteFontPackage` is the
// single seam `mutate.ts` uses, so asserting on it pins the delete→GC
// pipeline without touching the local/S3 backends.
vi.mock('@/server/domains/fonts/storage', () => ({
  deleteFontPackage: vi.fn(async () => undefined),
}))

// Section-change dispatch (backup/audit reschedule, mail transport
// invalidation) is covered by the unit tests; keep it out of these
// persistence-focused cases.
vi.mock('@/server/domains/settings/services/section-changes', () => ({
  SECTION_CHANGE_HANDLERS: new Map(),
}))

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
  vi.mocked(deleteFontPackage).mockClear()
})

let hashCounter = 0

async function seedFont(overrides: Partial<typeof font.$inferInsert> = {}): Promise<FontRow> {
  const hash = overrides.hash ?? `hash-${++hashCounter}`
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

async function readFontsSettingsData(): Promise<Record<string, unknown> | null> {
  const rows = await db.select().from(setting).where(eq(setting.scope, 'blog.fonts'))
  return (rows[0]?.data as Record<string, unknown> | undefined) ?? null
}

describe('fonts/services/mutate — setFontSlot', () => {
  it('assigns font ids to a slot and preserves other slots on later writes', async () => {
    const a = await seedFont()
    const b = await seedFont()

    await setFontSlot(db, 'global', [a.id, b.id], null)
    const afterGlobal = await readFontsSettingsData()
    expect(afterGlobal).toMatchObject({ global: [a.id, b.id], post: [], code: [] })

    await setFontSlot(db, 'post', [b.id], null)
    const afterPost = await readFontsSettingsData()
    expect(afterPost).toMatchObject({ global: [a.id, b.id], post: [b.id], code: [] })
  })
})

describe('fonts/services/mutate — deleteFont', () => {
  it('deletes an unreferenced font row and attempts the storage-package delete', async () => {
    const target = await seedFont()

    const deleted = await deleteFont(db, target.id)

    expect(deleted.id).toBe(target.id)
    expect(deleteFontPackage).toHaveBeenCalledTimes(1)
    expect(deleteFontPackage).toHaveBeenCalledWith(target.hash, 'local')
    const remaining = await db.select().from(font).where(eq(font.id, target.id))
    expect(remaining).toHaveLength(0)
  })

  it('refuses to delete a slot-referenced font with CONFLICT naming the slot', async () => {
    const target = await seedFont()
    await setFontSlot(db, 'global', [target.id], null)

    const error: unknown = await deleteFont(db, target.id).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(DomainError)
    expect((error as DomainError).code).toBe('CONFLICT')
    expect((error as DomainError).message).toContain('global')
    const remaining = await db.select().from(font).where(eq(font.id, target.id))
    expect(remaining).toHaveLength(1)
    expect(deleteFontPackage).not.toHaveBeenCalled()
  })

  it('rejects a missing font id with NOT_FOUND', async () => {
    const error: unknown = await deleteFont(db, '00000000-0000-0000-0000-000000000000').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(DomainError)
    expect((error as DomainError).code).toBe('NOT_FOUND')
  })

  it('lists every referencing slot in the CONFLICT message', async () => {
    const target = await seedFont()
    await setFontSlot(db, 'global', [target.id], null)
    await setFontSlot(db, 'post', [target.id], null)

    const error: unknown = await deleteFont(db, target.id).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(DomainError)
    expect((error as DomainError).code).toBe('CONFLICT')
    expect((error as DomainError).message).toContain('global')
    expect((error as DomainError).message).toContain('post')
    expect((error as DomainError).message).not.toContain('code')
    const remaining = await db.select().from(font).where(eq(font.id, target.id))
    expect(remaining).toHaveLength(1)
  })
})
