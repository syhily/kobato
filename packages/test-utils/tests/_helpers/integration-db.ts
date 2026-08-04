import type { Database, DatabaseHandle } from '@kobato/server/infra/db/database'

import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { closeDatabase, openDatabase } from '@kobato/server/infra/db/database'
import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/node-sqlite/migrator'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll } from 'vitest'

const MIGRATIONS_FOLDER = './drizzle'
const MIGRATIONS_TABLE = '__drizzle_migrations'

/**
 * Integration-test database harness — no server, no docker, and no
 * Postgres-era per-worker temp files by default. `getTestDb` returns
 * the SHARED in-memory database the lifecycle global owns (`:memory:`
 * is per-connection, so this is the one handle that keeps direct users
 * and domain code reading `getDb()` on the same data; db-lifecycle
 * migrates it at import). `createTestDatabaseFile` is the explicit
 * opt-in for file-backed flows — backup/restore (VACUUM INTO, file
 * swaps) and anything asserting on-disk behavior; file handles
 * self-clean via the registry below (the afterAll at the bottom of
 * this module). Files needing the handle itself (rare — raw client
 * pragmas, file paths) import `getDatabaseHandle` from db-lifecycle.
 */
const openHandles: DatabaseHandle[] = []
const tempDirs: string[] = []

/** The ONE in-memory database this module graph shares (migrated at import). */
export function getTestDb(): Database {
  return getDatabaseHandle().db
}

/** A fresh, migrated temp FILE — for flows that need a real file on disk. */
export function createTestDatabaseFile(): DatabaseHandle {
  const dir = mkdtempSync(join(tmpdir(), 'kobato-it-'))
  tempDirs.push(dir)
  const handle = openDatabase(join(dir, 'test.db'))
  migrate(handle.db, { migrationsFolder: MIGRATIONS_FOLDER, migrationsTable: MIGRATIONS_TABLE })
  openHandles.push(handle)
  return handle
}

/** Test-teardown hook: close every file-backed handle still registered. */
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

// File-local cleanup, registered at module scope so setup.ts never
// needs to import this helper (that import pulled db-lifecycle's whole
// side-effect graph into the shared module cache before test files
// registered their vi.mock factories — mocks lost to the cache).
afterAll(() => {
  closeAllTestDatabases()
})

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
    // Reset AUTOINCREMENT high-water marks — plain DELETE leaves them
    // intact, and tests seeding FK-linked rows expect ids to restart.
    db.run(sql`DELETE FROM sqlite_sequence`)
  } finally {
    db.run(sql`PRAGMA foreign_keys = ON`)
  }
}
