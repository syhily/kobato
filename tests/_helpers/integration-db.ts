import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/node-sqlite/migrator'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll } from 'vitest'

import type { Database, DatabaseHandle } from '@/server/infra/db/database'

import { getDatabaseHandle } from '@/server/bootstrap/db-lifecycle'
import { closeDatabase, openDatabase } from '@/server/infra/db/database'

const MIGRATIONS_FOLDER = './drizzle'
const MIGRATIONS_TABLE = '__drizzle_migrations'

/**
 * Shared in-memory DB harness (no server/docker). `getTestDb` is the
 * migrated lifecycle global (`:memory:` is per-connection — one handle,
 * shared data). `createTestDatabaseFile` opts into a real temp file.
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

// Module-scope cleanup — setup.ts must never import this helper (cache-before-mocks hazard).
afterAll(() => {
  closeAllTestDatabases()
})

/** Delete all user-table rows with FK checks temporarily off, resetting AUTOINCREMENT ids. */
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
    // Reset AUTOINCREMENT high-water marks so seeded ids restart at 1.
    db.run(sql`DELETE FROM sqlite_sequence`)
  } finally {
    db.run(sql`PRAGMA foreign_keys = ON`)
  }
}
