import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

// Database backups (a `VACUUM INTO` snapshot uploaded through the storage
// abstraction). Unlike images/music, backups previously had no DB row —
// the S3 listing was the source of truth — which made it impossible to
// track which backend a given backup lives in after the local→S3
// migration. This table is now that source of truth: `createBackup`
// inserts a row, `listBackups` reads from it (+ reconciles any unrecorded
// files), and delete/cleanup/download all dispatch on `storage_driver`.
//
// `timestamp` is the sortable ISO-ish string encoded in the key
// (`backup/backup-<timestamp>.db`); `storage_path` is the full backend
// key. `storage_driver` mirrors the `image`/`music` convention.
export const backup = sqliteTable(
  'backup',
  {
    id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    timestamp: text('timestamp').notNull(),
    storagePath: text('storage_path').notNull(),
    storageDriver: text('storage_driver').$type<'s3' | 'local'>().notNull().default('s3'),
    byteSize: integer('byte_size').notNull(),
    createdBy: integer('created_by'),
  },
  (table) => [
    uniqueIndex('uq_backup_storage_path').on(table.storagePath),
    index('idx_backup_created_at').on(table.createdAt),
    check('backup_storage_driver_chk', sql`${table.storageDriver} IN ('s3', 'local')`),
  ],
)
