import type { Database, DatabaseHandle } from '@kobato/db/sqlite/database'

import { closeDatabase, databaseOf, openDatabase, sqliteOf } from '@kobato/db/sqlite/database'
import { MIGRATIONS_TABLE, migrateDatabase } from '@kobato/db/sqlite/migrate'
import { sql } from 'drizzle-orm'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll } from 'vitest'

const fileHandles: DatabaseHandle[] = []
const tempDirs: string[] = []
let sharedHandle: DatabaseHandle | null = null

function openMigratedHandle(path: string): DatabaseHandle {
  const handle = openDatabase(path)
  migrateDatabase(databaseOf(handle))
  return handle
}

export function getTestDb(): Database {
  sharedHandle ??= openMigratedHandle(':memory:')
  return databaseOf(sharedHandle)
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
  const sdb = sqliteOf(db)
  const rows = sdb.all<{ name: string }>(sql`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
      AND name != ${MIGRATIONS_TABLE}
    ORDER BY name
  `)
  sdb.run(sql`PRAGMA foreign_keys = OFF`)
  try {
    for (const { name } of rows) {
      sdb.run(sql.raw(`DELETE FROM "${name}"`))
    }
    sdb.run(sql`DELETE FROM sqlite_sequence`)
  } finally {
    sdb.run(sql`PRAGMA foreign_keys = ON`)
  }
}
