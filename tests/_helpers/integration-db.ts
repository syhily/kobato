import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/node-sqlite/migrator'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Database, DatabaseHandle } from '@/server/infra/db/database'

import { closeDatabase, openDatabase } from '@/server/infra/db/database'

const MIGRATIONS_FOLDER = './drizzle'
const MIGRATIONS_TABLE = '__drizzle_migrations'

/**
 * Integration-test database harness — the SQLite era. No server, no
 * docker: every worker database is a temp FILE, opened through the same
 * `openDatabase` pragma path as production and migrated with drizzle's
 * node-sqlite migrator. A per-worker registry lets `setup.ts` clean up
 * the stragglers a test file forgot to close.
 */
const openHandles: DatabaseHandle[] = []
const tempDirs: string[] = []

export function createTestDatabase(): DatabaseHandle {
  // When the integration setup has assigned a worker database file, open
  // THAT file — the lifecycle global (`db-lifecycle`) uses it too, so
  // per-file handles and the global see one shared database (exactly the
  // old "one Postgres database, many connections" semantics; WAL permits
  // multiple in-process connections). Otherwise (unit tests, `:memory:`)
  // create a fresh, migrated temp file.
  const configured = process.env.storage__database
  const shared = configured !== undefined && configured !== ':memory:' && configured !== ''
  if (shared) {
    const handle = openDatabase(configured)
    openHandles.push(handle)
    return handle
  }
  const dir = mkdtempSync(join(tmpdir(), 'kobato-it-'))
  tempDirs.push(dir)
  const handle = openDatabase(join(dir, 'test.db'))
  migrate(handle.db, { migrationsFolder: MIGRATIONS_FOLDER, migrationsTable: MIGRATIONS_TABLE })
  openHandles.push(handle)
  return handle
}

export function closeTestDatabase(handle: DatabaseHandle): void {
  const index = openHandles.indexOf(handle)
  if (index !== -1) {
    openHandles.splice(index, 1)
  }
  closeDatabase(handle)
}

/** Test-teardown hook: close every handle still registered. */
export function closeAllTestDatabases(): void {
  for (const handle of openHandles.splice(0)) {
    try {
      closeDatabase(handle)
    } catch {
      // already closed by the test — fine
    }
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * Migrate a worker database file in place (tests/it/setup.ts assigns
 * `storage__database` first, then calls this — the assignment must
 * precede any import that could evaluate `@/server/infra/config`,
 * because the config module freezes `storage.database` at first load).
 */
export function migrateWorkerDatabase(dbPath: string): void {
  const handle = openDatabase(dbPath)
  migrate(handle.db, { migrationsFolder: MIGRATIONS_FOLDER, migrationsTable: MIGRATIONS_TABLE })
  closeDatabase(handle)
}

/** Kept for call-site symmetry with the old harness — files are removed
 *  by `closeAllTestDatabases`, so this is a no-op. */
export function dropWorkerDatabase(_dbNameOrUrl: string): void {}

/**
 * Delete every row from all user tables (FK checks temporarily off, like
 * the old `TRUNCATE … CASCADE`). Useful when a test file wants to reset
 * state between its own cases without tearing down the database.
 */
export async function clearAllTables(db: Database): Promise<void> {
  const rows = db.all<{ name: string }>(sql`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
      AND name != ${MIGRATIONS_TABLE}
    ORDER BY name
  `)
  db.run(sql`PRAGMA foreign_keys = OFF`)
  try {
    for (const { name } of rows) {
      db.run(sql.raw(`DELETE FROM "${name}"`))
    }
  } finally {
    db.run(sql`PRAGMA foreign_keys = ON`)
  }
}
