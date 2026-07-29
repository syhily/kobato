import { ACCESS_LOG_DDL } from '@/server/domains/analytics/services/access-log'
import { runAccessLogRetention } from '@/server/domains/analytics/services/maintenance'
import {
  type AnalyticsHandle,
  closeAnalyticsDatabase,
  openAnalyticsDatabase,
  resolveAnalyticsPath,
} from '@/server/infra/analytics/duckdb'
import { registerShutdownHook } from '@/server/infra/lifecycle'
import { computeNextRun, scheduleJob, type ScheduledJob } from '@/server/infra/scheduler-utils'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

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

export function scheduleNextAnalyticsMaintenance(): void {
  maintenanceJob ??= scheduleJob({
    name: 'analytics.maintenance',
    nextDelayMs: () => {
      const timeZone = getBlogSettingsBundleSync()?.siteIdentity?.timeZone ?? 'UTC'
      return computeNextRun({ frequency: 'daily', hour: 4, minute: 30 }, timeZone, new Date()).getTime() - Date.now()
    },
    run: async () => {
      if (current !== null) {
        await runAccessLogRetention(current)
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

/**
 * Close the sidecar for the restore machine's file swap and forget the
 * handle (the maintenance job is stopped first so it can't fire against
 * a closing file). The content database's prepare step calls this after
 * the batcher flush; the reopen happens via `initAnalyticsDatabase`.
 */
export async function closeAnalyticsForRestore(): Promise<void> {
  if (maintenanceJob !== null) {
    maintenanceJob.stop()
    maintenanceJob = null
  }
  if (current !== null) {
    const handle = current
    current = null
    await closeAnalyticsDatabase(handle)
  }
}

registerShutdownHook(async () => {
  if (current !== null) {
    await closeAnalyticsDatabase(current)
    current = null
  }
}, 0)
