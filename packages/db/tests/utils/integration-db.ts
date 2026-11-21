import type { Database, DatabaseHandle } from '@kobato/db/database.ts'

import { closeDatabase, openDatabase } from '@kobato/db/database.ts'
import { MIGRATIONS_TABLE, migrateDatabase } from '@kobato/db/migrate.ts'
import { sql } from 'drizzle-orm'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll } from 'vitest'

/**
 * SQLite test harness owned entirely by `@kobato/db` — open, migrate, close.
 * `getTestDb` lazily creates the migrated shared in-memory handle (`:memory:`
 * is per-connection, so one handle shares the data); the per-file `afterAll`
 * closes it, so the next file in an `isolate: false` worker migrates a fresh
 * database. `createTestDatabaseFile` opts into a real temp file with the same
 * lifecycle.
 */
const fileHandles: DatabaseHandle[] = []
const tempDirs: string[] = []
let sharedHandle: DatabaseHandle | null = null

function openMigratedHandle(path: string): DatabaseHandle {
  const handle = openDatabase(path)
  migrateDatabase(handle.db)
  return handle
}

export function getTestDb(): Database {
  sharedHandle ??= openMigratedHandle(':memory:')
  return sharedHandle.db
}

export function createTestDatabaseFile(): DatabaseHandle {
  const dir = mkdtempSync(join(tmpdir(), 'kobato-it-'))
  tempDirs.push(dir)
  const handle = openMigratedHandle(join(dir, 'test.db'))
  fileHandles.push(handle)
  return handle
}

export function closeAllTestDatabases(): void {
  if (sharedHandle !== null) {
    try {
      closeDatabase(sharedHandle)
    } catch {}
    sharedHandle = null
  }
  for (const handle of fileHandles.splice(0)) {
    try {
      closeDatabase(handle)
    } catch {}
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
}

afterAll(() => {
  closeAllTestDatabases()
})

export function clearAllTables(db: Database): void {
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
    db.run(sql`DELETE FROM sqlite_sequence`)
  } finally {
    db.run(sql`PRAGMA foreign_keys = ON`)
  }
}
