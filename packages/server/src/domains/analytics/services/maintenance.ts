import type { AnalyticsHandle } from '@kobato/server/infra/analytics/duckdb'

import { ACCESS_LOG_RETENTION_DAYS } from '@kobato/server/domains/analytics/services/access-log'
import { EPOCH_MS_PARAM, epochMsParam } from '@kobato/server/domains/analytics/services/duckdb-sql'
import { getLogger } from '@kobato/server/infra/logger'
import { stat } from 'node:fs/promises'

const log = getLogger('analytics.maintenance')

/**
 * The DuckDB half of the daily DB maintenance job (plan §1.11): the
 * 180-day retention DELETE + CHECKPOINT, with row-count and file-size
 * logging before and after. access_log knowledge (the table, the
 * retention window, the epoch binding) lives entirely here in the
 * domain — the bootstrap lifecycle owns only the scheduling and the
 * handle.
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
    const before = await handle.reader.runAndReadAll('SELECT count(*) AS c FROM access_log')
    const beforeCount = before.getRowObjects()[0]?.c
    const beforeSize = await analyticsFileSize(handle)

    const cutoff = new Date(Date.now() - ACCESS_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    await handle.writer.runAndReadAll(`DELETE FROM access_log WHERE ts < ${EPOCH_MS_PARAM}`, [epochMsParam(cutoff)])
    await handle.writer.run('CHECKPOINT')

    const after = await handle.reader.runAndReadAll('SELECT count(*) AS c FROM access_log')
    const afterCount = after.getRowObjects()[0]?.c
    const afterSize = await analyticsFileSize(handle)
    log.info('analytics maintenance completed', {
      retentionDays: ACCESS_LOG_RETENTION_DAYS,
      rowsBefore: beforeCount,
      rowsAfter: afterCount,
      bytesBefore: beforeSize,
      bytesAfter: afterSize,
    })
  } catch (error) {
    log.error('analytics maintenance failed', { error: error instanceof Error ? error.message : String(error) })
  }
}
