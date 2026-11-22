import type { Database } from '@kobato/db/database'
import type { BackupRow, NewBackup } from '@kobato/db/types'

import { sqliteOf } from '@kobato/db/database'
import { backup } from '@kobato/db/schema/backup'
import { desc, eq, lt } from 'drizzle-orm'
import { DatabaseSync } from 'node:sqlite'

export async function insertBackup(db: Database, values: NewBackup): Promise<BackupRow> {
  const rows = await sqliteOf(db).insert(backup).values(values).returning()
  return rows[0]!
}

export async function insertBackupIfMissing(db: Database, values: NewBackup): Promise<void> {
  await sqliteOf(db).insert(backup).values(values).onConflictDoNothing({ target: backup.storagePath })
}

export async function findBackupByTimestamp(db: Database, timestamp: string): Promise<BackupRow | null> {
  const rows = await sqliteOf(db).select().from(backup).where(eq(backup.timestamp, timestamp)).limit(1)
  return rows[0] ?? null
}

export async function listBackupRows(db: Database, limit?: number, offset = 0): Promise<BackupRow[]> {
  const base = sqliteOf(db).select().from(backup).orderBy(desc(backup.createdAt))
  if (limit !== undefined && limit > 0 && offset > 0) {
    return base.limit(limit).offset(offset)
  }
  if (limit !== undefined && limit > 0) {
    return base.limit(limit)
  }
  if (offset > 0) {
    return base.offset(offset)
  }
  return base
}

export async function deleteBackupRow(db: Database, id: number): Promise<void> {
  await sqliteOf(db).delete(backup).where(eq(backup.id, id))
}

export async function findOldBackupRows(db: Database, cutoff: Date): Promise<BackupRow[]> {
  return sqliteOf(db).select().from(backup).where(lt(backup.createdAt, cutoff))
}

export async function listBackupStoragePaths(db: Database): Promise<string[]> {
  const rows = await sqliteOf(db).select({ path: backup.storagePath }).from(backup)
  return rows.map((r) => r.path)
}

/**
 * Verifies a staged content-database file carries at least one live admin. The read-only open, the probe, and the
 * close all stay inside `@kobato/db` — the caller only passes the staged file path.
 */
export function stagedContentDbHasLiveAdmin(stagedContentPath: string): boolean {
  const client = new DatabaseSync(stagedContentPath, { readOnly: true })
  try {
    const row: unknown = client
      .prepare(`SELECT count(*) AS admins FROM "user" WHERE "role" = 'admin' AND "deleted_at" IS NULL`)
      .get()
    const admins =
      row !== null && typeof row === 'object' && 'admins' in row && typeof row.admins === 'number' ? row.admins : 0
    return admins >= 1
  } finally {
    client.close()
  }
}
