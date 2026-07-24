import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { eq, inArray } from 'drizzle-orm'

import type { FontRow } from '@/server/infra/db/schema/font'
import type { AdminFontDto } from '@/shared/contracts/fonts'

import { font } from '@/server/infra/db/schema/font'

// Read side of the fonts domain. Pure DB queries — no mutation, no audit,
// no I/O beyond Postgres. The DTO mapping lives here so both the oRPC
// `fonts.list` handler and the SSR bundle resolver share one mapper.

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

/** Return every font row, newest first — feeds the admin library grid. */
export async function listFonts(db: NodePgDatabase): Promise<AdminFontDto[]> {
  const rows = await db.select().from(font).orderBy(font.createdAt)
  return rows.map(toAdminFontDto)
}

/**
 * Resolve the font rows referenced by a settings `fonts` payload in a
 * single batched query, keyed by id. Unknown ids (stale UUIDs left in the
 * settings row after a font was GC'd) are silently dropped — the SSR
 * renderer simply omits them rather than crashing.
 *
 * Returns the rows in **no particular order**; callers that care about
 * slot order re-sort by the slot list themselves (see `resolveSlotOrder`).
 */
export async function findFontsByIds(db: NodePgDatabase, ids: readonly string[]): Promise<Map<string, FontRow>> {
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

/**
 * Reorder a slot's font-id list into the corresponding `FontRow`s,
 * preserving the slot's declared order and dropping ids that no longer
 * resolve to a row (defensive against stale settings).
 */
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

/** Single-row fetch by id; `null` when the font does not exist. */
export async function findFontById(db: NodePgDatabase, id: string): Promise<FontRow | null> {
  const rows = await db.select().from(font).where(eq(font.id, id)).limit(1)
  return rows[0] ?? null
}

/** Single-row fetch by content hash (the dedup key). `null` when absent. */
export async function findFontByHash(db: NodePgDatabase, hash: string): Promise<FontRow | null> {
  const rows = await db.select().from(font).where(eq(font.hash, hash)).limit(1)
  return rows[0] ?? null
}
