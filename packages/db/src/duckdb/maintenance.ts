import type { AnalyticsHandle, DuckDBLogger } from '@kobato/db/duckdb/database'

import { ACCESS_EVENTS_RETENTION_DAYS } from '@kobato/db/duckdb/access-events'
import { ANALYTICS_TABLES } from '@kobato/db/duckdb/schema'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { stat } from 'node:fs/promises'

async function analyticsFileSize(handle: AnalyticsHandle): Promise<number | null> {
  if (handle.inMemory) {
    return null
  }
  const stats = await stat(handle.path).catch(() => null)
  return stats?.size ?? null
}

async function countRetentionRows(handle: AnalyticsHandle): Promise<bigint> {
  let total = 0n
  for (const table of ANALYTICS_TABLES) {
    const result = await handle.reader.runAndReadAll(`SELECT count(*) AS c FROM ${table}`)
    total += unsafeCast<bigint>(result.getRowObjects()[0]?.c ?? 0n)
  }
  return total
}

export async function runAccessLogRetention(handle: AnalyticsHandle, logger?: DuckDBLogger): Promise<void> {
  try {
    const beforeCount = await countRetentionRows(handle)
    const beforeSize = await analyticsFileSize(handle)

    const cutoffSec = Math.floor((Date.now() - ACCESS_EVENTS_RETENTION_DAYS * 24 * 60 * 60 * 1000) / 1000)
    for (const table of ANALYTICS_TABLES) {
      await handle.writer.runAndReadAll(`DELETE FROM ${table} WHERE timestamp < to_timestamp(?)`, [cutoffSec])
    }
    await handle.writer.run('CHECKPOINT')

    const afterCount = await countRetentionRows(handle)
    const afterSize = await analyticsFileSize(handle)
    logger?.info('analytics maintenance completed', {
      retentionDays: ACCESS_EVENTS_RETENTION_DAYS,
      rowsBefore: beforeCount,
      rowsAfter: afterCount,
      bytesBefore: beforeSize,
      bytesAfter: afterSize,
    })
  } catch (error) {
    logger?.error('analytics maintenance failed', { error: error instanceof Error ? error.message : String(error) })
  }
}
