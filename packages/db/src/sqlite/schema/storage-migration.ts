import { sql } from 'drizzle-orm'
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const STORAGE_MIGRATION_DIRECTIONS = ['local-to-s3', 's3-to-local', 's3-to-s3'] as const
export type StorageMigrationDirection = (typeof STORAGE_MIGRATION_DIRECTIONS)[number]

export const STORAGE_MIGRATION_PERSISTED_PHASES = [
  'copying',
  'switching',
  'catching-up',
  'completed',
  'failed',
  'cancelled',
] as const
export type StorageMigrationPersistedPhase = (typeof STORAGE_MIGRATION_PERSISTED_PHASES)[number]

export const storageMigration = sqliteTable(
  'storage_migration',
  {
    id: integer('id').primaryKey().notNull(),
    direction: text('direction').$type<StorageMigrationDirection>().notNull(),
    targetStorage: text('target_storage'),
    sourceStorage: text('source_storage'),
    phase: text('phase').$type<StorageMigrationPersistedPhase>().notNull(),
    cursor: text('cursor'),
    copiedObjects: integer('copied_objects').notNull().default(0),
    copiedBytes: integer('copied_bytes').notNull().default(0),
    skippedObjects: integer('skipped_objects').notNull().default(0),
    error: text('error'),
    verification: text('verification'),
    startedAt: integer('started_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    check('storage_migration_singleton_chk', sql`${table.id} = 1`),
    check('storage_migration_direction_chk', sql`${table.direction} IN ('local-to-s3', 's3-to-local', 's3-to-s3')`),
    check(
      'storage_migration_phase_chk',
      sql`${table.phase} IN ('copying', 'switching', 'catching-up', 'completed', 'failed', 'cancelled')`,
    ),
  ],
)
