import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { drizzle, type NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

declare const databaseBrand: unique symbol
declare const databaseHandleBrand: unique symbol

/**
 * Opaque content-database engine token. Carries no query surface — only `@kobato/db` unwraps it into the Drizzle
 * engine; `@kobato/server` holds the token and passes it back into db operations (mirrors the DuckDB
 * `AnalyticsHandle`).
 */
export interface Database {
  readonly [databaseBrand]: true
}

/**
 * Opaque content-database lifecycle handle. Lifecycle metadata only — no native client or Drizzle engine fields.
 */
export interface DatabaseHandle {
  readonly [databaseHandleBrand]: true
  readonly path: string
  readonly inMemory: boolean
  closed: boolean
}

/**
 * The SQLite anatomy behind the opaque tokens (Drizzle engine + native client). Db-plane only: never part of a
 * `@kobato/server` signature. Tests reach it through `sqliteEngineOf`.
 */
export interface SqliteEngine {
  db: NodeSQLiteDatabase
  client: DatabaseSync
  path: string
  inMemory: boolean
  closed: boolean
}

/**
 * The single sanctioned unwrap seam from the opaque `Database` token to the Drizzle engine. Db-plane only — never
 * import this from `@kobato/server`.
 */
export function sqliteOf(database: Database): NodeSQLiteDatabase {
  return unsafeCast<NodeSQLiteDatabase>(database)
}

/**
 * The single sanctioned unwrap seam from the opaque `DatabaseHandle` to the engine anatomy. Db-plane only.
 */
export function sqliteEngineOf(handle: DatabaseHandle): SqliteEngine {
  return unsafeCast<SqliteEngine>(handle)
}

/**
 * Extract the opaque engine token from a lifecycle handle. Safe for any plane — the result is still opaque.
 */
export function databaseOf(handle: DatabaseHandle): Database {
  return unsafeCast<Database>(sqliteEngineOf(handle).db)
}

export function isInMemoryPath(p: string): boolean {
  return p === ':memory:'
}

export function resolveStoragePath(configured: string, fallbackName: string, dataDir: string): string {
  if (isInMemoryPath(configured)) {
    return configured
  }
  return path.resolve(configured === '' ? path.join(dataDir, fallbackName) : configured)
}

export function openDatabase(databasePath: string): DatabaseHandle {
  const inMemory = isInMemoryPath(databasePath)
  if (!inMemory) {
    mkdirSync(path.dirname(databasePath), { recursive: true })
  }
  const client = new DatabaseSync(databasePath)
  client.exec('PRAGMA auto_vacuum = INCREMENTAL')
  client.exec('PRAGMA journal_mode = WAL')
  client.exec('PRAGMA synchronous = NORMAL')
  client.exec('PRAGMA foreign_keys = ON')
  client.exec('PRAGMA busy_timeout = 5000')
  client.exec('PRAGMA cache_size = -20000')
  client.exec('PRAGMA temp_store = MEMORY')
  client.exec('PRAGMA mmap_size = 268435456')
  const engine: SqliteEngine = { db: drizzle({ client }), client, path: databasePath, inMemory, closed: false }
  return unsafeCast<DatabaseHandle>(engine)
}

export function closeDatabase(handle: DatabaseHandle): void {
  const engine = sqliteEngineOf(handle)
  if (engine.closed) {
    return
  }
  engine.closed = true
  engine.client.exec('PRAGMA optimize')
  if (!engine.inMemory) {
    engine.client.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  }
  engine.client.close()
}
