import type { DatabaseHandle } from '@/server/infra/db/database'

import { registerShutdownHook } from '@/server/infra/lifecycle'
import { getLogger } from '@/server/infra/logger'
import { computeNextRun } from '@/server/infra/scheduler-utils'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

const log = getLogger('db.maintenance')

/**
 * The SQLite half of the daily DB maintenance job (plan §1.11 — the
 * DuckDB half lives in `@/server/bootstrap/analytics-lifecycle`):
 *   1. `PRAGMA incremental_vacuum` — drain the freelist left by
 *      session/kv/token expiry churn; bounded and online under WAL.
 *   2. `PRAGMA optimize` — refresh planner statistics whose tables have
 *      drifted (SQLite's own heuristic ANALYZE).
 *   3. page_count / freelist_count logged before and after, so database
 *      growth and maintenance effect are observable in the log stream.
 * A full VACUUM is never scheduled (blocking, doubles disk usage) —
 * restore-from-backup already produces a fully defragmented file.
 * Scheduled daily at 04:30 in the site's configured timezone (the audit
 * archive runs at 04:00), same self-rescheduling seam as the other
 * sweeps.
 */

/** Read a single-value PRAGMA (page_count, freelist_count) as a number. */
function pragmaNumber(handle: DatabaseHandle, pragma: string): number {
  const row = handle.client.prepare(`PRAGMA ${pragma}`).get()
  const value = row === undefined ? undefined : Object.values(row)[0]
  return typeof value === 'number' ? value : Number(value ?? 0)
}

function pageStats(handle: DatabaseHandle): { pageCount: number; freelistCount: number } {
  return { pageCount: pragmaNumber(handle, 'page_count'), freelistCount: pragmaNumber(handle, 'freelist_count') }
}

export function runDbMaintenance(handle: DatabaseHandle): void {
  // Pragmas are connection-local no-ops inside transactions; run on the
  // raw client outside any drizzle work.
  try {
    const before = pageStats(handle)
    handle.client.exec('PRAGMA incremental_vacuum')
    handle.client.exec('PRAGMA optimize')
    const after = pageStats(handle)
    log.info('database maintenance completed', {
      pagesBefore: before.pageCount,
      pagesAfter: after.pageCount,
      freelistBefore: before.freelistCount,
      freelistAfter: after.freelistCount,
    })
  } catch (error) {
    log.error('database maintenance failed', { error: error instanceof Error ? error.message : String(error) })
  }
}

// ─── Scheduler ───────────────────────────────────────────
// Same structure as the kv sweep / audit archive: the handle getter is
// injected by the composition root (`@/server/bootstrap/db-lifecycle`)
// at wire time and invoked when the timer fires, so a reopened handle
// (restore completion) is picked up without being captured in module
// state.

let maintenanceTimer: NodeJS.Timeout | null = null
let resolveHandle: (() => DatabaseHandle) | null = null

export function wireDbMaintenanceScheduler(deps: { getHandle: () => DatabaseHandle }): void {
  resolveHandle = deps.getHandle
}

export function scheduleNextDbMaintenance(): void {
  if (maintenanceTimer !== null) {
    clearTimeout(maintenanceTimer)
    maintenanceTimer = null
  }
  const bundle = getBlogSettingsBundleSync()
  const timeZone = bundle?.siteIdentity?.timeZone ?? 'UTC'
  const nextRun = computeNextRun({ frequency: 'daily', hour: 4, minute: 30 }, timeZone, new Date())
  maintenanceTimer = setTimeout(() => {
    try {
      if (resolveHandle === null) {
        throw new Error('db maintenance fired before wireDbMaintenanceScheduler')
      }
      runDbMaintenance(resolveHandle())
    } catch (error) {
      log.error('db maintenance callback failed', { error: error instanceof Error ? error.message : String(error) })
    } finally {
      scheduleNextDbMaintenance()
    }
  }, nextRun.getTime() - Date.now())
  maintenanceTimer.unref()
}

export function stopDbMaintenanceScheduler(): void {
  if (maintenanceTimer !== null) {
    clearTimeout(maintenanceTimer)
    maintenanceTimer = null
  }
}

registerShutdownHook(async () => {
  stopDbMaintenanceScheduler()
}, 0)
