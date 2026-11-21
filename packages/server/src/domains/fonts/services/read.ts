import type { AdminFontDto } from '@kobato/contracts/fonts'
import type { Database } from '@kobato/db/database'
import type { FontRow } from '@kobato/db/schema/font'

import { font } from '@kobato/db/schema/font'
import { eq, inArray } from 'drizzle-orm'

export function toAdminFontDto(row: FontRow): AdminFontDto {
  return {
    id: row.id,
    familyName: row.familyName,
    sourceName: row.sourceName,
    hash: row.hash,
    cssKey: row.cssKey,
    storageDriver: row.storageDriver,
    chunkCount: row.chunkCount,
    totalBytes: row.totalBytes,
    etag: row.etag,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function listFonts(db: Database): Promise<AdminFontDto[]> {
  const rows = await db.select().from(font).orderBy(font.createdAt)
  return rows.map(toAdminFontDto)
}

export async function findFontsByIds(db: Database, ids: readonly string[]): Promise<Map<string, FontRow>> {
  if (ids.length === 0) {
    return new Map()
  }
  const unique = [...new Set(ids)]
  const rows = await db.select().from(font).where(inArray(font.id, unique))
  const byId = new Map<string, FontRow>()
  for (const row of rows) {
    byId.set(row.id, row)
  }
  return byId
}

export function resolveSlotOrder(ids: readonly string[], byId: Map<string, FontRow>): FontRow[] {
  const out: FontRow[] = []
  for (const id of ids) {
    const row = byId.get(id)
    if (row) {
      out.push(row)
    }
  }
  return out
}

export async function findFontByHash(db: Database, hash: string): Promise<FontRow | null> {
  const rows = await db.select().from(font).where(eq(font.hash, hash)).limit(1)
  return rows[0] ?? null
}
