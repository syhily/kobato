import { serverConfig } from '@kobato/server/infra/config'
import { drizzle, type NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/**
 * The canonical database handle. Every consumer imports this type — the
 * single owner of the drizzle driver choice (node:sqlite, sync API with
 * `.all()` / `.get()` / `.run()` terminals).
 */
export type Database = NodeSQLiteDatabase

export interface DatabaseHandle {
  db: Database
  client: DatabaseSync
  /** The path the handle was opened with (`:memory:` included). */
  path: string
  /** Decided once at open: the in-memory special case, so consumers read a flag instead of re-deriving it from `path`. */
  inMemory: boolean
  /** Set by `closeDatabase` — close is idempotent (restore may close early). */
  closed: boolean
}

/** The single owner of the `:memory:` convention, shared by both engines. */
export function isInMemoryPath(p: string): boolean {
  return p === ':memory:'
}

/**
 * The effective database file path: `storage.database` when set,
 * otherwise `<storage.data>/kobato.db`. `:memory:` passes through for
 * tests (a single shared in-memory database per process).
 */
export function resolveDatabasePath(): string {
  const configured = serverConfig.storage.database
  if (isInMemoryPath(configured)) {
    return configured
  }
  return path.resolve(configured === '' ? path.join(serverConfig.storage.data, 'kobato.db') : configured)
}

/**
 * Open the single per-process database connection and apply the pragma
 * set. ORDER MATTERS (verified against node:sqlite): `auto_vacuum` is
 * silently ignored on a database already in WAL mode, so it must come
 * first; on a fresh file it must also precede any DDL (migrations run
 * after open). The same pragma block serves every handle — the request
 * connection and the migration connection.
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
 * SQLite-recommended close pattern: refresh planner statistics, fold the
 * WAL back into a single clean on-disk file (which the restore flow can
 * then swap atomically), and close. Idempotent — the restore flow closes
 * the handle before swapping files, and the shutdown hook runs later.
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
