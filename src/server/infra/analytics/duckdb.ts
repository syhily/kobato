import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { serverConfig } from '@/server/infra/config'

/**
 * The embedded DuckDB analytics sidecar: one file, one instance, one
 * read connection + one write connection (DuckDB MVCC allows a reader
 * while the writer commits). `access_log` lives here — append-heavy
 * page-view telemetry plus the dashboard aggregation scans, the one
 * workload DuckDB is built for. Backups archive this file alongside
 * the content DB (two-file tar.gz), but a missing file is always
 * recreated empty — restore is a bonus, never a requirement.
 */
export interface AnalyticsHandle {
  instance: DuckDBInstance
  /** Writer (batcher appends, retention deletes, DDL). */
  writer: DuckDBConnection
  /** Dashboard read queries. */
  reader: DuckDBConnection
  /** The path the handle was opened with. */
  path: string
  closed: boolean
}

/** The effective analytics file path: `storage.analyticsDatabase` when
 *  set, otherwise `<storage.data>/analytics.duckdb`. */
export function resolveAnalyticsPath(): string {
  const configured = serverConfig.storage.analyticsDatabase
  return path.resolve(configured === '' ? path.join(serverConfig.storage.data, 'analytics.duckdb') : configured)
}

/** Open the sidecar and apply the caller's DDL. Idempotent DDL — a
 *  missing file is created empty at boot (the expendable-telemetry
 *  contract: restore never brings it back, boot just recreates it).
 *  `:memory:` opens an in-memory database (tests). The DDL is injected
 *  because infra carries zero business knowledge — the access_log table
 *  shape is owned by the analytics domain
 *  (`@/server/domains/analytics/services/access-log`). */
export async function openAnalyticsDatabase(analyticsPath: string, ddl: string): Promise<AnalyticsHandle> {
  // mkdir FIRST (same order as openDatabase): a custom
  // storage.analyticsDatabase in a missing directory must be created
  // before DuckDB tries to open the file.
  if (analyticsPath !== ':memory:') {
    mkdirSync(path.dirname(analyticsPath), { recursive: true })
  }
  const instance =
    analyticsPath === ':memory:' ? await DuckDBInstance.create() : await DuckDBInstance.create(analyticsPath)
  const writer = await instance.connect()
  const reader = await instance.connect()
  await writer.run(ddl)
  return { instance, writer, reader, path: analyticsPath, closed: false }
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
