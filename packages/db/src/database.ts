import { drizzle, type NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/** The canonical database handle; this module owns the drizzle driver choice (node:sqlite sync API). */
export type Database = NodeSQLiteDatabase

export interface DatabaseHandle {
  db: Database
  client: DatabaseSync
  /** The path the handle was opened with (`:memory:` included). */
  path: string
  /** Decided once at open: the in-memory special case. */
  inMemory: boolean
  /** Set by `closeDatabase` — close is idempotent. */
  closed: boolean
}

/** The single owner of the `:memory:` convention, shared by both engines. */
export function isInMemoryPath(p: string): boolean {
  return p === ':memory:'
}

/** `:memory:` passes through for tests; '' falls back to `<dataDir>/<fallbackName>`. */
export function resolveStoragePath(configured: string, fallbackName: string, dataDir: string): string {
  if (isInMemoryPath(configured)) {
    return configured
  }
  return path.resolve(configured === '' ? path.join(dataDir, fallbackName) : configured)
}

/**
 * Open the per-process connection. `auto_vacuum` must be set first —
 * it is ignored once WAL mode is active.
 */
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
  // ~20 MiB page cache, in-memory temp tables, 256 MiB mmap window.
  client.exec('PRAGMA cache_size = -20000')
  client.exec('PRAGMA temp_store = MEMORY')
  client.exec('PRAGMA mmap_size = 268435456')
  return { db: drizzle({ client }), client, path: databasePath, inMemory, closed: false }
}

/**
 * SQLite-recommended close pattern (optimize, fold WAL, close).
 * Idempotent.
 */
export function closeDatabase(handle: DatabaseHandle): void {
  if (handle.closed) {
    return
  }
  handle.closed = true
  handle.client.exec('PRAGMA optimize')
  if (!handle.inMemory) {
    handle.client.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  }
  handle.client.close()
}
