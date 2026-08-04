import type { FontRow } from '@kobato/server/infra/db/schema/font'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeMemoryBackend } from '#/_helpers/memory-storage'

import { deleteFont, setFontSlot } from '@kobato/server/domains/fonts/services/mutate'
import { __clearSectionChangeHandlersForTests } from '@kobato/server/domains/settings/services/section-changes'
import { setting } from '@kobato/server/infra/db/schema/config'
import { font } from '@kobato/server/infra/db/schema/font'
import { DomainError } from '@kobato/server/infra/http/errors'
import { __resetStorageBackendsForTests, __setStorageBackendForTests } from '@kobato/server/infra/storage/registry'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// The storage registry is the ONLY substituted boundary — DB and settings
// stay real, which is the point of this coverage. The real
// `deleteFontPackage` runs against a shared in-memory backend (a true
// external — S3/local disk) injected through the registry's test seam, so
// the delete→GC pipeline is pinned by the objects actually disappearing
// from the store. Font rows here are all driver 'local', so the seam
// substitutes the 'local' driver only (S3 stays unconfigured, which keeps
// the active backend local).
const mem = makeMemoryBackend({ driver: 'local' })

// Section-change dispatch (backup/audit reschedule, mail transport
// invalidation) is covered by the unit tests; keep it out of these
// persistence-focused cases.
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

/** Mirror what putFont would have written: result.css + the woff2 chunks. */
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
    // The real deleteFontPackage ran against the memory backend: every
    // object under fonts/<hash>/ is gone, via deletePrefix.
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
    // The refusal happened before the storage GC: the package is untouched.
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
