import { eq, inArray } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { FontRow } from '@/server/infra/db/schema/font'
import type { AdminFontDto } from '@/shared/contracts/fonts'

import { font } from '@/server/infra/db/schema/font'

// Read side of the fonts domain — pure DB queries. The DTO mapping lives
// here so `fonts.list` and the SSR bundle resolver share it.

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

/** Every font row, ordered by creation time (oldest first). */
export async function listFonts(db: Database): Promise<AdminFontDto[]> {
  const rows = await db.select().from(font).orderBy(font.createdAt)
  return rows.map(toAdminFontDto)
}

/** Batched id→row lookup. Unknown ids are silently dropped; result order is unspecified — callers re-sort via `resolveSlotOrder`. */
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

/** Slot ids → `FontRow`s in declared order; ids with no row are dropped. */
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

/** Single-row fetch by content hash (the dedup key). `null` when absent. */
export async function findFontByHash(db: Database, hash: string): Promise<FontRow | null> {
  const rows = await db.select().from(font).where(eq(font.hash, hash)).limit(1)
  return rows[0] ?? null
}
