import type { FontRow } from '@kobato/db/schema/font.ts'

import { setting } from '@kobato/db/schema/config.ts'
import { font } from '@kobato/db/schema/font.ts'
import { deleteFont, setFontSlot } from '@kobato/server/domains/fonts/services/mutate.ts'
import { __clearSectionChangeHandlersForTests } from '@kobato/server/domains/settings/services/section-changes.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'
import { __resetStorageBackendsForTests, __setStorageBackendForTests } from '@kobato/server/infra/storage/registry.ts'
import { clearAllTables, getTestDb } from '@kobato/test/integration-db.ts'
import { makeMemoryBackend } from '@kobato/test/memory-storage.ts'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const mem = makeMemoryBackend({ driver: 'local' })

const db = getTestDb()

beforeEach(async () => {
  __setStorageBackendForTests('local', mem.backend)
  __clearSectionChangeHandlersForTests()
  await clearAllTables(db)
})

afterEach(() => {
  __resetStorageBackendsForTests()
  mem.reset()
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

function seedFontPackage(hash: string): void {
  for (const name of ['result.css', 'chunk-0.woff2', 'chunk-1.woff2', 'chunk-2.woff2']) {
    mem.store.set(`fonts/${hash}/${name}`, { body: Buffer.from(name), contentType: 'application/octet-stream' })
  }
}

function packageKeys(hash: string): string[] {
  return [...mem.store.keys()].filter((key) => key.startsWith(`fonts/${hash}/`))
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
  it('deletes an unreferenced font row and clears its storage package', async () => {
    const target = await seedFont()
    seedFontPackage(target.hash)

    const deleted = await deleteFont(db, target.id)

    expect(deleted.id).toBe(target.id)
    const remaining = await db.select().from(font).where(eq(font.id, target.id))
    expect(remaining).toHaveLength(0)
    expect(packageKeys(target.hash)).toHaveLength(0)
    expect(mem.deletedKeys).toContain(`fonts/${target.hash}/result.css`)
    expect(mem.deletedKeys).toContain(`fonts/${target.hash}/chunk-0.woff2`)
  })

  it('refuses to delete a slot-referenced font with CONFLICT naming the slot', async () => {
    const target = await seedFont()
    seedFontPackage(target.hash)
    await setFontSlot(db, 'global', [target.id], null)

    const error: unknown = await deleteFont(db, target.id).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(DomainError)
    expect((error as DomainError).code).toBe('CONFLICT')
    expect((error as DomainError).message).toContain('global')
    const remaining = await db.select().from(font).where(eq(font.id, target.id))
    expect(remaining).toHaveLength(1)
    expect(packageKeys(target.hash)).toHaveLength(4)
    expect(mem.deletedKeys).toHaveLength(0)
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
