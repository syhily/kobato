import type { FontRow } from '@kobato/db/sqlite/schema/font'
import type { FontSplitOutputFile } from '@kobato/server/domains/fonts/vendor/napi-split'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { setting } from '@kobato/db/sqlite/schema/config'
import { font } from '@kobato/db/sqlite/schema/font'
import { deleteFont, setFontSlot } from '@kobato/server/domains/fonts/services/mutate'
import { uploadFont } from '@kobato/server/domains/fonts/services/upload'
import { fontSplit } from '@kobato/server/domains/fonts/vendor/napi-split'
import { __clearSectionChangeHandlersForTests } from '@kobato/server/domains/settings/services/section-changes'
import { DomainError } from '@kobato/server/infra/http/errors'
import { __resetStorageBackendsForTests, __setStorageBackendForTests } from '@kobato/server/infra/storage/registry'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makeMemoryBackend } from '@kobato/server/tests/utils/memory-storage'
import { eq } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@kobato/server/domains/fonts/vendor/napi-split', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kobato/server/domains/fonts/vendor/napi-split')>()
  return { ...actual, fontSplit: vi.fn(), fontSplitAlgorithmVersion: vi.fn(() => 'algo-1') }
})

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
  const [row] = await sqliteOf(db)
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

const FONT_BYTES = new Uint8Array([0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
const FONT_HASH = createHash('sha256').update(FONT_BYTES).digest('hex')

function slicedPackage(family: string): FontSplitOutputFile[] {
  const css = `@font-face{font-family:"${family}";src:url("./abc.woff2")format("woff2");}`
  return [
    { name: 'result.css', data: new TextEncoder().encode(css) },
    { name: 'abc.woff2', data: new Uint8Array([0x77, 0x4f, 0x46, 0x32]) },
  ]
}

function storedCss(cssKey: string): string {
  return mem.store.get(cssKey)?.body.toString() ?? ''
}

async function readFontsSettingsData(): Promise<Record<string, unknown> | null> {
  const rows = await sqliteOf(db).select().from(setting).where(eq(setting.scope, 'blog.fonts'))
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
    const remaining = await sqliteOf(db).select().from(font).where(eq(font.id, target.id))
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
    const remaining = await sqliteOf(db).select().from(font).where(eq(font.id, target.id))
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
    const remaining = await sqliteOf(db).select().from(font).where(eq(font.id, target.id))
    expect(remaining).toHaveLength(1)
  })
})

describe('fonts/services/upload — uploadFont', () => {
  beforeEach(() => {
    __setStorageBackendForTests('s3', mem.backend)
    vi.mocked(fontSplit).mockReset()
    vi.mocked(fontSplit).mockImplementation(async ({ css }) => slicedPackage(css?.fontFamily ?? 'default'))
  })

  it('slices a new font under its sha256 and the requested family name', async () => {
    const uploaded = await uploadFont(db, { buffer: FONT_BYTES, sourceName: 'serif.ttf', familyName: 'Serif A' })

    expect(uploaded.familyName).toBe('Serif A')
    expect(uploaded.hash).toBe(FONT_HASH)
    expect(uploaded.cssKey).toBe(`fonts/${FONT_HASH}/algo-1/result.css`)
    expect(uploaded.chunkCount).toBe(1)
    expect(uploaded.totalBytes).toBe(slicedPackage('Serif A').reduce((total, file) => total + file.data.length, 0))
    expect(storedCss(uploaded.cssKey)).toContain('font-family:"Serif A"')
  })

  it('returns the stored font untouched when the same bytes arrive under the same family', async () => {
    const first = await uploadFont(db, { buffer: FONT_BYTES, sourceName: 'serif.ttf', familyName: 'Serif A' })
    mem.putKeys.length = 0

    const again = await uploadFont(db, { buffer: FONT_BYTES, sourceName: 'copy.ttf', familyName: 'Serif A' })

    expect(again.id).toBe(first.id)
    expect(fontSplit).toHaveBeenCalledTimes(1)
    expect(mem.putKeys).toEqual([])
  })

  it('re-slices under the new family name when the same bytes arrive renamed, keeping the font id', async () => {
    const first = await uploadFont(db, { buffer: FONT_BYTES, sourceName: 'serif.ttf', familyName: 'Serif A' })

    const renamed = await uploadFont(db, { buffer: FONT_BYTES, sourceName: 'serif.ttf', familyName: 'Serif B' })

    expect(renamed.id).toBe(first.id)
    expect(renamed.familyName).toBe('Serif B')
    expect(fontSplit).toHaveBeenCalledTimes(2)
    expect(vi.mocked(fontSplit).mock.calls[1]?.[0].css?.fontFamily).toBe('Serif B')
    const rows = await sqliteOf(db).select().from(font).where(eq(font.hash, FONT_HASH))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.familyName).toBe('Serif B')
    expect(storedCss(renamed.cssKey)).toContain('font-family:"Serif B"')
    expect(storedCss(renamed.cssKey)).not.toContain('Serif A')
    const expectedEtag = createHash('sha256')
      .update(Buffer.from(slicedPackage('Serif B')[0]!.data))
      .digest('hex')
    expect(renamed.etag).toBe(expectedEtag)
  })
})
