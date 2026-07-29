import { copyFile } from 'node:fs/promises'

import type { AnalyticsReader } from '@/server/domains/analytics/services/duckdb-sql'

import { ManagedEngine } from '@/server/bootstrap/managed-engine'
import { ACCESS_LOG_DDL } from '@/server/domains/analytics/services/access-log'
import { runAccessLogRetention } from '@/server/domains/analytics/services/maintenance'
import {
  type AnalyticsHandle,
  closeAnalyticsDatabase,
  openAnalyticsDatabase,
  resolveAnalyticsPath,
} from '@/server/infra/analytics/duckdb'
import { nextDailyMaintenanceDelayMs, scheduleJob, type ScheduledJob } from '@/server/infra/scheduler-utils'

/**
 * Boot-time owner of the DuckDB sidecar: opens it alongside the content
 * database, closes it after every batcher has flushed (the engine's
 * priority-0 shutdown hook runs after the priority-100 flushes). The
 * DuckDB half of the daily DB maintenance job (180-day retention
 * DELETE + CHECKPOINT, row-count and file-size logging) is wired here
 * too — daily at 04:30 in the site's configured timezone, the same
 * wall-clock slot as the SQLite half (one policy owner:
 * `nextDailyMaintenanceDelayMs`).
 */
const engine = new ManagedEngine<AnalyticsHandle>(
  {
    open: () => openAnalyticsDatabase(resolveAnalyticsPath(), ACCESS_LOG_DDL),
    close: closeAnalyticsDatabase,
  },
  'analyticsHandle',
)

let maintenanceJob: ScheduledJob | null = null

export function scheduleNextAnalyticsMaintenance(): void {
  maintenanceJob ??= scheduleJob({
    name: 'analytics.maintenance',
    nextDelayMs: nextDailyMaintenanceDelayMs,
    run: async () => {
      const handle = engine.peek()
      if (handle !== null) {
        await runAccessLogRetention(handle)
      }
    },
  })
  maintenanceJob.reschedule()
}

export async function initAnalyticsDatabase(): Promise<void> {
  await engine.init()
  scheduleNextAnalyticsMaintenance()
}

export function getAnalyticsHandle(): AnalyticsHandle {
  return engine.get()
}

/**
 * The MVCC-safe read connection for dashboard/report queries. The
 * writer/reader split is a private implementation detail of this module
 * — query call sites never see the handle, and the writer stays
 * reachable only through the batcher's lazy getter.
 */
export function getAnalyticsReader(): AnalyticsReader {
  return getAnalyticsHandle().reader
}

/**
 * Checkpoint the sidecar and copy it to `stagingPath` for a backup
 * archive. Returns false when there is nothing to archive (an in-memory
 * handle in tests). Errors propagate — the caller decides whether the
 * sidecar is expendable (backup) or load-bearing (nothing else is).
 */
export async function snapshotAnalyticsTo(stagingPath: string): Promise<boolean> {
  const handle = getAnalyticsHandle()
  if (handle.inMemory) {
    return false
  }
  await handle.writer.run('CHECKPOINT')
  await copyFile(handle.path, stagingPath)
  return true
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
  await engine.closeForSwap()
}
