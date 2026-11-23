import type { AdminFontDto } from '@kobato/api/contracts/fonts'
import type { Database } from '@kobato/db/sqlite/database'
import type { FontRow } from '@kobato/db/sqlite/types'

import {
  findFontByHash as findFontByHashOp,
  findFontRowsByIds,
  listFontRows,
} from '@kobato/db/sqlite/operations/system/font'

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
  const rows = await listFontRows(db)
  return rows.map(toAdminFontDto)
}

export async function findFontsByIds(db: Database, ids: readonly string[]): Promise<Map<string, FontRow>> {
  return findFontRowsByIds(db, ids)
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
  return findFontByHashOp(db, hash)
}
