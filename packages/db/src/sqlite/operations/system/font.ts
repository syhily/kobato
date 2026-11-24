import type { Database } from '@kobato/db/sqlite/database'
import type { FontRow, NewFont } from '@kobato/db/sqlite/types'
import type { StorageDriver } from '@kobato/settings/types'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { font } from '@kobato/db/sqlite/schema/font'
import { eq, inArray } from 'drizzle-orm'

export async function listFontRows(db: Database): Promise<FontRow[]> {
  return sqliteOf(db).select().from(font).orderBy(font.createdAt)
}

export async function findFontRowsByIds(db: Database, ids: readonly string[]): Promise<Map<string, FontRow>> {
  if (ids.length === 0) {
    return new Map()
  }
  const unique = [...new Set(ids)]
  const rows = await sqliteOf(db).select().from(font).where(inArray(font.id, unique))
  const byId = new Map<string, FontRow>()
  for (const row of rows) {
    byId.set(row.id, row)
  }
  return byId
}

export async function findFontByHash(db: Database, hash: string): Promise<FontRow | null> {
  const rows = await sqliteOf(db).select().from(font).where(eq(font.hash, hash)).limit(1)
  return rows[0] ?? null
}

export async function insertFont(db: Database, values: NewFont): Promise<FontRow> {
  const rows = await sqliteOf(db).insert(font).values(values).returning()
  return rows[0]!
}

export async function deleteFontRowById(db: Database, id: string): Promise<void> {
  await sqliteOf(db).delete(font).where(eq(font.id, id))
}

export interface FontPackageUpdate {
  cssKey: string
  storageDriver: StorageDriver
  chunkCount: number
  totalBytes: number
  etag: string
}

export async function updateFontPackage(db: Database, id: string, values: FontPackageUpdate): Promise<void> {
  await sqliteOf(db).update(font).set(values).where(eq(font.id, id))
}

export async function findFontById(db: Database, id: string): Promise<FontRow | null> {
  const rows = await sqliteOf(db).select().from(font).where(eq(font.id, id)).limit(1)
  return rows[0] ?? null
}
