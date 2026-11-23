import type { DuckDBLogger } from '@kobato/db/duckdb/logger'
import type { MigrateAnalyticsDatabaseOptions } from '@kobato/db/duckdb/migrate'

import { DuckDBInstance } from '@duckdb/node-api'
import { analyticsHandleOf, engineOf, type AnalyticsHandle, type DuckDbEngine } from '@kobato/db/duckdb/connection'
import { migrateAnalyticsDatabase } from '@kobato/db/duckdb/migrate'
import { isInMemoryPath } from '@kobato/db/sqlite/database'
import { mkdirSync } from 'node:fs'
import { open, rename, rm } from 'node:fs/promises'
import path from 'node:path'

export type OpenAnalyticsDatabaseOptions = MigrateAnalyticsDatabaseOptions

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

async function upgradeStorageFormat(analyticsPath: string, logger: DuckDBLogger | undefined): Promise<void> {
  const tmpPath = `${analyticsPath}.v2-upgrade`
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
  logger?.info('Analytics sidecar upgraded to the DuckDB 2.0 storage format', { path: analyticsPath })
}

export async function openAnalyticsDatabase(
  analyticsPath: string,
  options: OpenAnalyticsDatabaseOptions = {},
): Promise<AnalyticsHandle> {
  const inMemory = isInMemoryPath(analyticsPath)
  if (!inMemory) {
    mkdirSync(path.dirname(analyticsPath), { recursive: true })
    const storageVersion = await readStorageVersion(analyticsPath)
    if (storageVersion !== null && storageVersion < DUCKDB2_STORAGE_VERSION) {
      try {
        await upgradeStorageFormat(analyticsPath, options.logger)
      } catch (error) {
        await rm(`${analyticsPath}.v2-upgrade`, { force: true })
        options.logger?.warn('Analytics sidecar storage upgrade failed; keeping the 1.x format', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }
  const instance = inMemory ? await DuckDBInstance.create() : await DuckDBInstance.create(analyticsPath)
  const writer = await instance.connect()
  const reader = await instance.connect()
  const engine: DuckDbEngine = { instance, writer, reader, path: analyticsPath, inMemory, closed: false }
  const handle = analyticsHandleOf(engine)
  try {
    await migrateAnalyticsDatabase(handle, options)
    return handle
  } catch (error) {
    handle.closed = true
    writer.closeSync()
    reader.closeSync()
    instance.closeSync()
    throw error
  }
}

export async function checkpointAnalyticsDatabase(handle: AnalyticsHandle): Promise<void> {
  await engineOf(handle).writer.run('CHECKPOINT')
}

export async function closeAnalyticsDatabase(handle: AnalyticsHandle): Promise<void> {
  if (handle.closed) {
    return
  }
  handle.closed = true
  await checkpointAnalyticsDatabase(handle)
  const engine = engineOf(handle)
  engine.writer.closeSync()
  engine.reader.closeSync()
  engine.instance.closeSync()
}
