import type { Database } from '@kobato/db/sqlite/database'
import type { StorageMigrationPersistedPhase } from '@kobato/db/sqlite/schema/storage-migration'
import type { StorageMigrationRow } from '@kobato/db/sqlite/types'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { backup as backupTable } from '@kobato/db/sqlite/schema/backup'
import { font as fontTable } from '@kobato/db/sqlite/schema/font'
import { image, music } from '@kobato/db/sqlite/schema/media'
import { storageMigration } from '@kobato/db/sqlite/schema/storage-migration'
import { and, eq, isNull } from 'drizzle-orm'

export interface LocalStorageObjectCounts {
  images: number
  music: number
  backups: number
}

export async function countLocalStorageObjects(db: Database): Promise<LocalStorageObjectCounts> {
  const sdb = sqliteOf(db)
  const [localImages, localMusic, localBackups] = await Promise.all([
    sdb
      .select({ path: image.storagePath })
      .from(image)
      .where(and(eq(image.storageDriver, 'local'), isNull(image.deletedAt))),
    sdb
      .select({ id: music.id })
      .from(music)
      .where(and(eq(music.storageDriver, 'local'), isNull(music.deletedAt))),
    sdb.select({ id: backupTable.id }).from(backupTable).where(eq(backupTable.storageDriver, 'local')),
  ])
  return { images: localImages.length, music: localMusic.length, backups: localBackups.length }
}

export async function findStorageMigrationRow(db: Database): Promise<StorageMigrationRow | null> {
  const rows = await sqliteOf(db).select().from(storageMigration).where(eq(storageMigration.id, 1))
  return rows[0] ?? null
}

export async function upsertStorageMigrationRow(db: Database, values: Omit<StorageMigrationRow, 'id'>): Promise<void> {
  await sqliteOf(db)
    .insert(storageMigration)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({ target: storageMigration.id, set: values })
}

export async function updateStorageMigrationPhase(db: Database, phase: StorageMigrationPersistedPhase): Promise<void> {
  await sqliteOf(db).update(storageMigration).set({ phase, updatedAt: new Date() }).where(eq(storageMigration.id, 1))
}

export async function resumeStorageMigrationRow(db: Database): Promise<void> {
  await sqliteOf(db)
    .update(storageMigration)
    .set({ phase: 'copying', error: null, updatedAt: new Date(), finishedAt: null })
    .where(eq(storageMigration.id, 1))
}

export async function cancelStorageMigrationRow(db: Database): Promise<void> {
  await sqliteOf(db)
    .update(storageMigration)
    .set({ phase: 'cancelled', error: null, updatedAt: new Date(), finishedAt: new Date() })
    .where(eq(storageMigration.id, 1))
}

export async function persistStorageMigrationCounters(
  db: Database,
  counters: { copiedObjects: number; copiedBytes: number; skippedObjects: number },
  cursor: string | null,
): Promise<void> {
  await sqliteOf(db)
    .update(storageMigration)
    .set({
      copiedObjects: counters.copiedObjects,
      copiedBytes: counters.copiedBytes,
      skippedObjects: counters.skippedObjects,
      ...(cursor !== null ? { cursor } : {}),
      updatedAt: new Date(),
    })
    .where(eq(storageMigration.id, 1))
}

export async function completeStorageMigrationRow(db: Database, verificationJson: string): Promise<void> {
  await sqliteOf(db)
    .update(storageMigration)
    .set({
      phase: 'completed',
      verification: verificationJson,
      updatedAt: new Date(),
      finishedAt: new Date(),
    })
    .where(eq(storageMigration.id, 1))
}

export async function failStorageMigrationRow(
  db: Database,
  phase: 'failed' | 'cancelled',
  error: string | null,
): Promise<void> {
  await sqliteOf(db)
    .update(storageMigration)
    .set({
      phase,
      error,
      updatedAt: new Date(),
      finishedAt: new Date(),
    })
    .where(eq(storageMigration.id, 1))
}

export async function flipStorageDriverColumns(db: Database, from: 'local' | 's3', to: 'local' | 's3'): Promise<void> {
  const sdb = sqliteOf(db)
  await sdb.update(image).set({ storageDriver: to }).where(eq(image.storageDriver, from))
  await sdb.update(music).set({ storageDriver: to }).where(eq(music.storageDriver, from))
  await sdb.update(fontTable).set({ storageDriver: to }).where(eq(fontTable.storageDriver, from))
  await sdb.update(backupTable).set({ storageDriver: to }).where(eq(backupTable.storageDriver, from))
}
