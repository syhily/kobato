import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { serverConfig } from '@/server/infra/config'

/**
 * The embedded DuckDB analytics sidecar: one file, one instance, one
 * read connection + one write connection (DuckDB MVCC allows a reader
 * while the writer commits). `access_log` lives here — append-heavy
 * page-view telemetry plus the dashboard aggregation scans, the one
 * workload DuckDB is built for. The content DB stays small; telemetry
 * bulk is excluded from backups (expendable by design).
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

// The access_log DDL. No secondary indexes — zone maps + columnar scans
// replace the six btree indexes the Postgres schema carried (prototype-
// verified: 0.5 ms full count, 22–35 ms dashboard queries at 1M rows).
const ACCESS_LOG_DDL = `
CREATE TABLE IF NOT EXISTS access_log (
  ts              TIMESTAMP NOT NULL,
  visitor_hash    VARCHAR NOT NULL,
  session_id      VARCHAR,
  ip              VARCHAR,
  path            VARCHAR NOT NULL,
  entity_type     VARCHAR,
  entity_id       BIGINT,
  referer         VARCHAR,
  referer_host    VARCHAR,
  country         VARCHAR,
  region          VARCHAR,
  city            VARCHAR,
  latitude        DOUBLE,
  longitude       DOUBLE,
  timezone        VARCHAR,
  language        VARCHAR,
  ua              VARCHAR,
  browser         VARCHAR,
  browser_version VARCHAR,
  os              VARCHAR,
  os_version      VARCHAR,
  device          VARCHAR,
  device_type     VARCHAR,
  is_bot          BOOLEAN NOT NULL
)
`

/** Open the sidecar and ensure the schema exists. Idempotent DDL — a
 *  missing file is created empty at boot (the expendable-telemetry
 *  contract: restore never brings it back, boot just recreates it).
 *  `:memory:` opens an in-memory database (tests). */
export async function openAnalyticsDatabase(analyticsPath: string): Promise<AnalyticsHandle> {
  const instance =
    analyticsPath === ':memory:' ? await DuckDBInstance.create() : await DuckDBInstance.create(analyticsPath)
  if (analyticsPath !== ':memory:') {
    mkdirSync(path.dirname(analyticsPath), { recursive: true })
  }
  const writer = await instance.connect()
  const reader = await instance.connect()
  await writer.run(ACCESS_LOG_DDL)
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
