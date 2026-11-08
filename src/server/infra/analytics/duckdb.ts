import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { serverConfig } from '@/server/infra/config'
import { isInMemoryPath, resolveStoragePath } from '@/server/infra/db/database'

/**
 * The embedded DuckDB analytics sidecar: one file, one instance, one
 * reader + one writer connection, hosting the analytics tables (schema
 * injected by the caller). Backups archive it with the content DB, but a
 * missing file is recreated empty — restore is a bonus.
 */
export interface AnalyticsHandle {
  instance: DuckDBInstance
  /** Writer (batcher appends, retention deletes, DDL). */
  writer: DuckDBConnection
  /** Dashboard read queries. */
  reader: DuckDBConnection
  path: string
  /** Decided once at open: the in-memory special case. */
  inMemory: boolean
  closed: boolean
}

/** `:memory:` passes through — `path.resolve(':memory:')` would yield a file. */
export function resolveAnalyticsPath(): string {
  return resolveStoragePath(serverConfig.storage.analyticsDatabase, 'analytics.duckdb')
}

/**
 * Newly created files stay on the DuckDB 1.5.x storage format so a
 * `kobato rollback` to a pre-2.0 binary can still open the sidecar —
 * 2.0's default format is unreadable by every earlier release, and the
 * sidecar uses no 2.0-only storage feature. Existing files keep the
 * version they were created with either way. Revisit when the oldest
 * rollback target ships DuckDB 2.0.
 */
const STORAGE_COMPATIBILITY_VERSION = 'v1.5.6'

/** Open the sidecar and apply the caller's DDL statements (idempotent — a
 *  missing file is created empty). DDL is injected: infra owns no analytics schema. */
export async function openAnalyticsDatabase(analyticsPath: string, ddl: string | string[]): Promise<AnalyticsHandle> {
  // mkdir first — a custom path in a missing directory must exist before DuckDB opens.
  const inMemory = isInMemoryPath(analyticsPath)
  if (!inMemory) {
    mkdirSync(path.dirname(analyticsPath), { recursive: true })
  }
  const instance = inMemory
    ? await DuckDBInstance.create()
    : await DuckDBInstance.create(analyticsPath, { storage_compatibility_version: STORAGE_COMPATIBILITY_VERSION })
  const writer = await instance.connect()
  const reader = await instance.connect()
  for (const statement of typeof ddl === 'string' ? [ddl] : ddl) {
    await writer.run(statement)
  }
  return { instance, writer, reader, path: analyticsPath, inMemory, closed: false }
}

export async function closeAnalyticsDatabase(handle: AnalyticsHandle): Promise<void> {
  if (handle.closed) {
    return
  }
  handle.closed = true
  // Fold the WAL so the on-disk state is one clean file.
  await handle.writer.run('CHECKPOINT')
  handle.writer.closeSync()
  handle.reader.closeSync()
  handle.instance.closeSync()
}
