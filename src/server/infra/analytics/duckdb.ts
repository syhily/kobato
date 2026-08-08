import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { serverConfig } from '@/server/infra/config'
import { isInMemoryPath } from '@/server/infra/db/database'

/**
 * The embedded DuckDB analytics sidecar: one file, one instance, one
 * reader + one writer connection, hosting `access_log`. Backups archive
 * it with the content DB, but a missing file is recreated empty — restore is a bonus.
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
  const configured = serverConfig.storage.analyticsDatabase
  if (isInMemoryPath(configured)) {
    return configured
  }
  return path.resolve(configured === '' ? path.join(serverConfig.storage.data, 'analytics.duckdb') : configured)
}

/** Open the sidecar and apply the caller's DDL (idempotent — a missing
 *  file is created empty). DDL is injected: infra owns no analytics schema. */
export async function openAnalyticsDatabase(analyticsPath: string, ddl: string): Promise<AnalyticsHandle> {
  // mkdir first — a custom path in a missing directory must exist before DuckDB opens.
  const inMemory = isInMemoryPath(analyticsPath)
  if (!inMemory) {
    mkdirSync(path.dirname(analyticsPath), { recursive: true })
  }
  const instance = inMemory ? await DuckDBInstance.create() : await DuckDBInstance.create(analyticsPath)
  const writer = await instance.connect()
  const reader = await instance.connect()
  await writer.run(ddl)
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
