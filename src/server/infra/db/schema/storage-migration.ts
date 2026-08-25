import { sql } from 'drizzle-orm'
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import type { StorageMigrationDirection, StorageMigrationPersistedPhase } from '@/shared/contracts/storage'

// Storage migration state — a single-row table (id is pinned to 1) tracking
// the current/last storage migration task. `target_storage` holds the S3
// target config as JSON with `secretAccessKey` encrypted via
// `infra/crypto/secret-encryption` (null for s3→local); `source_storage` is
// the pre-flip S3 config snapshot (null when the source is local) so catch-up
// / verification / resume still read the OLD bucket after the flip. `cursor`
// is the last successfully processed source key; a resume re-lists from it.
// Phases: copying → switching → catching-up → completed, with failed /
// cancelled as terminal states and interrupted reported lazily (row says
// in-flight but no in-memory task is running).
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
    // Final source/target consistency check (JSON of StorageMigrationVerification), set on completion.
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
