import { sql } from 'drizzle-orm'
import { bigint, bigserial, check, index, pgTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core'

// `pg_dump` gzipped backups. Unlike images/music, backups previously had no
// DB row — the S3 listing was the source of truth — which made it impossible
// to track which backend a given backup lives in after the local→S3
// migration. This table is now that source of truth: `createBackup` inserts a
// row, `listBackups` reads from it (+ reconciles any unrecorded files), and
// delete/cleanup/download all dispatch on `storage_driver`.
//
// `timestamp` is the sortable ISO-ish string encoded in the key
// (`backup/backup-<timestamp>.sql.gz`); `storage_path` is the full backend
// key. `storage_driver` mirrors the `image`/`music` convention.
export const backup = pgTable(
  'backup',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
    timestamp: varchar('timestamp', { length: 32 }).notNull(),
    storagePath: varchar('storage_path', { length: 500 }).notNull(),
    storageDriver: varchar('storage_driver', { length: 8 }).$type<'s3' | 'local'>().notNull().default('s3'),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    createdBy: bigint('created_by', { mode: 'bigint' }),
  },
  (table) => [
    uniqueIndex('uq_backup_storage_path').on(table.storagePath),
    index('idx_backup_created_at').on(table.createdAt),
    check('backup_storage_driver_chk', sql`${table.storageDriver} IN ('s3', 'local')`),
  ],
)
