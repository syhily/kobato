import type { Database, DatabaseHandle } from '@kobato/db/database'

import { closeDatabase, openDatabase } from '@kobato/db/database'
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

/**
 * Shared in-memory DB harness. `getTestDb` is the migrated lifecycle global (`:memory:`
 * is per-connection, so one handle shares the data); `createTestDatabaseFile` opts into a
 * real temp file.
 */
const openHandles: DatabaseHandle[] = []
const tempDirs: string[] = []

export function getTestDb(): Database {
  return getDatabaseHandle().db
}

export function createTestDatabaseFile(): DatabaseHandle {
  const dir = mkdtempSync(join(tmpdir(), 'kobato-it-'))
  tempDirs.push(dir)
  const handle = openDatabase(join(dir, 'test.db'))
  migrateDatabase(handle.db)
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
  await wipeCache()
  __resetMemoryCacheForTests()
  resetCacheCounterMemo()
}
