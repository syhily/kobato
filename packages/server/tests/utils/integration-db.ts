import type { Database, DatabaseHandle } from '@kobato/db/database'

import { closeDatabase, databaseOf, openDatabase, sqliteOf } from '@kobato/db/database'
import { MIGRATIONS_TABLE, migrateDatabase } from '@kobato/db/migrate'
import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { wipeCache } from '@kobato/server/infra/cache/file-store'
import { __resetMemoryCacheForTests } from '@kobato/server/infra/cache/memory-store'
import { resetCacheCounterMemo } from '@kobato/server/infra/cache/registry'
import { sql } from 'drizzle-orm'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll } from 'vitest'

const openHandles: DatabaseHandle[] = []
const tempDirs: string[] = []

export function getTestDb(): Database {
  return databaseOf(getDatabaseHandle())
}

export function createTestDatabaseFile(): DatabaseHandle {
  const dir = mkdtempSync(join(tmpdir(), 'kobato-it-'))
  tempDirs.push(dir)
  const handle = openDatabase(join(dir, 'test.db'))
  migrateDatabase(databaseOf(handle))
  openHandles.push(handle)
  return handle
}

export function closeAllTestDatabases(): void {
  for (const handle of openHandles.splice(0)) {
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

export async function clearAllTables(db: Database): Promise<void> {
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
  await wipeCache()
  __resetMemoryCacheForTests()
  resetCacheCounterMemo()
}
