import type { Database, DatabaseHandle, SqliteEngine } from '@kobato/db/database'

import { sqliteEngineOf, sqliteOf } from '@kobato/db/database'
import { sql } from 'drizzle-orm'

export function vacuumDatabaseInto(db: Database, targetPath: string): void {
  sqliteOf(db).run(sql.raw(`VACUUM INTO '${targetPath.replaceAll("'", "''")}'`))
}

export function analyzeDatabase(db: Database): void {
  sqliteOf(db).run(sql`ANALYZE`)
}

export interface SqlitePageStats {
  pageCount: number
  freelistCount: number
}

export interface SqliteMaintenanceStats {
  before: SqlitePageStats
  after: SqlitePageStats
}

/**
 * Runs the periodic SQLite PRAGMA maintenance (incremental vacuum + optimize) and returns the page statistics
 * before and after the pass. The native client never leaves this package.
 */
export function runSqlitePragmaMaintenance(handle: DatabaseHandle): SqliteMaintenanceStats {
  const engine = sqliteEngineOf(handle)
  const before = pageStats(engine)
  engine.client.exec('PRAGMA incremental_vacuum')
  engine.client.exec('PRAGMA optimize')
  return { before, after: pageStats(engine) }
}

function pageStats(engine: SqliteEngine): SqlitePageStats {
  return { pageCount: pragmaNumber(engine, 'page_count'), freelistCount: pragmaNumber(engine, 'freelist_count') }
}

function pragmaNumber(engine: SqliteEngine, pragma: string): number {
  const row = engine.client.prepare(`PRAGMA ${pragma}`).get()
  const value = row === undefined ? undefined : Object.values(row)[0]
  return typeof value === 'number' ? value : Number(value ?? 0)
}
