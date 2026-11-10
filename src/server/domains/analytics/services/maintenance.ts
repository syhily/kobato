import { stat } from 'node:fs/promises'

import type { AnalyticsHandle } from '@/server/infra/analytics/duckdb'

import { ACCESS_EVENTS_RETENTION_DAYS } from '@/server/domains/analytics/services/access-log'
import { ANALYTICS_TABLES } from '@/server/domains/analytics/services/schema'
import { getLogger } from '@/server/infra/logger'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const log = getLogger('analytics.maintenance')

/**
 * The DuckDB half of the daily DB maintenance job: the 180-day retention DELETE
 * + CHECKPOINT, applied to every table in `ANALYTICS_TABLES` at one cutoff — no
 * sidecar row can outlive the event it keys.
 */

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
    // count(*) is BIGINT, which the row-object converter yields as a bigint.
    total += unsafeCast<bigint>(result.getRowObjects()[0]?.c ?? 0n)
  }
  return total
}

export async function runAccessLogRetention(handle: AnalyticsHandle): Promise<void> {
  try {
    const beforeCount = await countRetentionRows(handle)
    const beforeSize = await analyticsFileSize(handle)

    // Epoch SECONDS through to_timestamp — both sides stay TIMESTAMPTZ, so
    // the cutoff never shifts with the (unpinned) session TimeZone.
    const cutoffSec = Math.floor((Date.now() - ACCESS_EVENTS_RETENTION_DAYS * 24 * 60 * 60 * 1000) / 1000)
    for (const table of ANALYTICS_TABLES) {
      await handle.writer.runAndReadAll(`DELETE FROM ${table} WHERE timestamp < to_timestamp(?)`, [cutoffSec])
    }
    await handle.writer.run('CHECKPOINT')

    const afterCount = await countRetentionRows(handle)
    const afterSize = await analyticsFileSize(handle)
    log.info('analytics maintenance completed', {
      retentionDays: ACCESS_EVENTS_RETENTION_DAYS,
      rowsBefore: beforeCount,
      rowsAfter: afterCount,
      bytesBefore: beforeSize,
      bytesAfter: afterSize,
    })
  } catch (error) {
    log.error('analytics maintenance failed', { error: error instanceof Error ? error.message : String(error) })
  }
}
