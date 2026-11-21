import type { Database } from '@kobato/db/database'
import type { BackupRow, NewBackup } from '@kobato/db/types'

import { backup } from '@kobato/db/schema/backup'
import { desc, eq, lt } from 'drizzle-orm'

export async function insertBackup(db: Database, values: NewBackup): Promise<BackupRow> {
  const rows = await db.insert(backup).values(values).returning()
  return rows[0]!
}

export async function insertBackupIfMissing(db: Database, values: NewBackup): Promise<void> {
  await db.insert(backup).values(values).onConflictDoNothing({ target: backup.storagePath })
}

export async function findBackupByTimestamp(db: Database, timestamp: string): Promise<BackupRow | null> {
  const rows = await db.select().from(backup).where(eq(backup.timestamp, timestamp)).limit(1)
  return rows[0] ?? null
}

export async function listBackupRows(db: Database, limit?: number, offset = 0): Promise<BackupRow[]> {
  const base = db.select().from(backup).orderBy(desc(backup.createdAt))
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
  await db.delete(backup).where(eq(backup.id, id))
}

export async function findOldBackupRows(db: Database, cutoff: Date): Promise<BackupRow[]> {
  return db.select().from(backup).where(lt(backup.createdAt, cutoff))
}

export async function listBackupStoragePaths(db: Database): Promise<string[]> {
  const rows = await db.select({ path: backup.storagePath }).from(backup)
  return rows.map((r) => r.path)
}
