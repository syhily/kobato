import { stat } from 'node:fs/promises'

import type { AnalyticsHandle } from '@/server/infra/analytics/duckdb'

import { ACCESS_EVENTS_RETENTION_DAYS } from '@/server/domains/analytics/services/access-log'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('analytics.maintenance')

/**
 * The DuckDB half of the daily DB maintenance job (plan §1.11): the
 * 180-day retention DELETE + CHECKPOINT. The bootstrap lifecycle owns
 * only the scheduling and the handle.
 */

async function analyticsFileSize(handle: AnalyticsHandle): Promise<number | null> {
  if (handle.inMemory) {
    return null
  }
  const stats = await stat(handle.path).catch(() => null)
  return stats?.size ?? null
}

export async function runAccessLogRetention(handle: AnalyticsHandle): Promise<void> {
  try {
    const before = await handle.reader.runAndReadAll('SELECT count(*) AS c FROM access_events')
    const beforeCount = before.getRowObjects()[0]?.c
    const beforeSize = await analyticsFileSize(handle)

    // Epoch SECONDS through to_timestamp — both sides stay TIMESTAMPTZ, so
    // the cutoff never shifts with the (unpinned) session TimeZone.
    const cutoffSec = Math.floor((Date.now() - ACCESS_EVENTS_RETENTION_DAYS * 24 * 60 * 60 * 1000) / 1000)
    await handle.writer.runAndReadAll('DELETE FROM access_events WHERE timestamp < to_timestamp(?)', [cutoffSec])
    await handle.writer.run('CHECKPOINT')

    const after = await handle.reader.runAndReadAll('SELECT count(*) AS c FROM access_events')
    const afterCount = after.getRowObjects()[0]?.c
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
