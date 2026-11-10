import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api'
import { mkdirSync } from 'node:fs'
import { open, rename, rm } from 'node:fs/promises'
import path from 'node:path'

import { serverConfig } from '@/server/infra/config'
import { isInMemoryPath, resolveStoragePath } from '@/server/infra/db/database'
import { getLogger } from '@/server/infra/logger'

/**
 * The embedded DuckDB analytics sidecar: one file, one instance, one
 * reader + one writer connection, hosting the analytics tables (schema
 * injected by the caller). Backups archive it with the content DB, but a
 * missing file is recreated empty — restore is a bonus. A pre-2.0 file is
 * upgraded to the 2.0 storage format at open, after which a rollback to a
 * pre-2.0 build can no longer read the sidecar.
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

const log = getLogger('analytics.duckdb')

/** `:memory:` passes through — `path.resolve(':memory:')` would yield a file. */
export function resolveAnalyticsPath(): string {
  return resolveStoragePath(serverConfig.storage.analyticsDatabase, 'analytics.duckdb')
}

/**
 * DuckDB MainHeader layout: 8-byte checksum, the "DUCK" magic, then the
 * uint64 storage version. 999 is what DuckDB 2.0 stamps on fresh files;
 * 1.x files carry 64–68. A fresh-file assertion lives in the integration
 * test, so a future engine bump that changes the number fails loudly.
 */
const STORAGE_VERSION_OFFSET = 12
const DUCKDB2_STORAGE_VERSION = 999n

async function readStorageVersion(filePath: string): Promise<bigint | null> {
  const handle = await open(filePath, 'r').catch(() => null)
  if (handle === null) {
    return null
  }
  try {
    const header = Buffer.alloc(20)
    const { bytesRead } = await handle.read(header, 0, 20, 0)
    if (bytesRead < 20 || header.toString('latin1', 8, 12) !== 'DUCK') {
      return null
    }
    return header.readBigUInt64LE(STORAGE_VERSION_OFFSET)
  } finally {
    await handle.close()
  }
}

const quoteSqlString = (value: string): string => `'${value.replaceAll("'", "''")}'`

/**
 * Rewrite a 1.x-format file into the 2.0 format: copy through a scratch
 * in-memory instance into a sibling file (ATTACH replays the legacy WAL,
 * so the copy sees everything), then swap. The stale WAL belongs to the
 * old header and must not survive the rename.
 */
async function upgradeStorageFormat(analyticsPath: string): Promise<void> {
  const tmpPath = `${analyticsPath}.v2-upgrade`
  // A crashed earlier attempt leaves a partial copy behind — never copy into it.
  await rm(tmpPath, { force: true })
  const scratch = await DuckDBInstance.create()
  const connection = await scratch.connect()
  try {
    await connection.run(`ATTACH ${quoteSqlString(analyticsPath)} AS legacy`)
    await connection.run(`ATTACH ${quoteSqlString(tmpPath)} AS upgraded`)
    await connection.run('COPY FROM DATABASE legacy TO upgraded')
    await connection.run('DETACH upgraded')
    await connection.run('DETACH legacy')
  } finally {
    connection.closeSync()
    scratch.closeSync()
  }
  await rm(`${analyticsPath}.wal`, { force: true })
  await rename(tmpPath, analyticsPath)
}

/** Open the sidecar and apply the caller's DDL statements (idempotent — a
 *  missing file is created empty). DDL is injected: infra owns no analytics schema. */
export async function openAnalyticsDatabase(analyticsPath: string, ddl: string | string[]): Promise<AnalyticsHandle> {
  // mkdir first — a custom path in a missing directory must exist before DuckDB opens.
  const inMemory = isInMemoryPath(analyticsPath)
  if (!inMemory) {
    mkdirSync(path.dirname(analyticsPath), { recursive: true })
    const storageVersion = await readStorageVersion(analyticsPath)
    if (storageVersion !== null && storageVersion < DUCKDB2_STORAGE_VERSION) {
      try {
        await upgradeStorageFormat(analyticsPath)
        log.info('Analytics sidecar upgraded to the DuckDB 2.0 storage format', { path: analyticsPath })
      } catch (error) {
        // 2.0 still reads the 1.x format — keep the original file and retry on the next boot.
        await rm(`${analyticsPath}.v2-upgrade`, { force: true })
        log.warn('Analytics sidecar storage upgrade failed; keeping the 1.x format', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }
  const instance = inMemory ? await DuckDBInstance.create() : await DuckDBInstance.create(analyticsPath)
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
