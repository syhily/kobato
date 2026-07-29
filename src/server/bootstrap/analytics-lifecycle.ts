import { stat } from 'node:fs/promises'

import { ACCESS_LOG_DDL, ACCESS_LOG_RETENTION_DAYS } from '@/server/domains/analytics/services/access-log'
import { EPOCH_MS_PARAM } from '@/server/domains/analytics/services/duckdb-sql'
import {
  type AnalyticsHandle,
  closeAnalyticsDatabase,
  openAnalyticsDatabase,
  resolveAnalyticsPath,
} from '@/server/infra/analytics/duckdb'
import { registerShutdownHook } from '@/server/infra/lifecycle'
import { getLogger } from '@/server/infra/logger'
import { computeNextRun, scheduleJob, type ScheduledJob } from '@/server/infra/scheduler-utils'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

const log = getLogger('analytics.lifecycle')

/**
 * Boot-time owner of the DuckDB sidecar: opens it alongside the content
 * database, closes it after every batcher has flushed (priority 0 —
 * batchers flush at 100, this runs after). The DuckDB half of the daily
 * DB maintenance job (plan §1.11: 180-day retention DELETE + CHECKPOINT,
 * row-count and file-size logging) is wired here too — daily at 04:30 in
 * the site's configured timezone, the same wall-clock scheduler seam as
 * the audit archive (04:00).
 */
let current: AnalyticsHandle | null = null
let maintenanceJob: ScheduledJob | null = null

async function analyticsFileSize(handle: AnalyticsHandle): Promise<number | null> {
  if (handle.path === ':memory:') {
    return null
  }
  const stats = await stat(handle.path).catch(() => null)
  return stats?.size ?? null
}

export async function runAnalyticsMaintenance(handle: AnalyticsHandle): Promise<void> {
  try {
    const before = await handle.reader.runAndReadAll('SELECT count(*) AS c FROM access_log')
    const beforeCount = before.getRowObjects()[0]?.c
    const beforeSize = await analyticsFileSize(handle)

    const cutoff = new Date(Date.now() - ACCESS_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    await handle.writer.runAndReadAll(`DELETE FROM access_log WHERE ts < ${EPOCH_MS_PARAM}`, [BigInt(cutoff.getTime())])
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

export function scheduleNextAnalyticsMaintenance(): void {
  maintenanceJob ??= scheduleJob({
    name: 'analytics.maintenance',
    nextDelayMs: () => {
      const timeZone = getBlogSettingsBundleSync()?.siteIdentity?.timeZone ?? 'UTC'
      return computeNextRun({ frequency: 'daily', hour: 4, minute: 30 }, timeZone, new Date()).getTime() - Date.now()
    },
    run: async () => {
      if (current !== null) {
        await runAnalyticsMaintenance(current)
      }
    },
  })
  maintenanceJob.reschedule()
}

// HMR-safe handle reuse: in dev, server.ts re-evaluates on every cycle —
// the content-DB handle survives via import.meta.hot.data (see
// db-lifecycle), and the sidecar needs the same treatment (a second
// DuckDBInstance on the same file plus duplicate maintenance timers).
function isAnalyticsHmrData(value: unknown): value is { analyticsHandle?: AnalyticsHandle } {
  return value !== null && typeof value === 'object'
}
const hmrData: unknown = import.meta.hot?.data
const hmr = isAnalyticsHmrData(hmrData) ? hmrData : undefined

export async function initAnalyticsDatabase(): Promise<void> {
  if (hmr?.analyticsHandle) {
    current = hmr.analyticsHandle
  } else {
    current = await openAnalyticsDatabase(resolveAnalyticsPath(), ACCESS_LOG_DDL)
    if (hmr) {
      hmr.analyticsHandle = current
    }
  }
  scheduleNextAnalyticsMaintenance()
}

export function getAnalyticsHandle(): AnalyticsHandle {
  if (current === null) {
    throw new Error('Analytics database not initialized')
  }
  return current
}

registerShutdownHook(async () => {
  if (current !== null) {
    await closeAnalyticsDatabase(current)
    current = null
  }
}, 0)
