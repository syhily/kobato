import type { DatabaseHandle } from '@/server/infra/db/database'

import { getLogger } from '@/server/infra/logger'
import { nextDailyMaintenanceDelayMs, scheduleJob, type ScheduledJob } from '@/server/infra/scheduler-utils'

const log = getLogger('db.maintenance')

/**
 * SQLite half of the daily DB maintenance job (plan §1.11 — DuckDB half
 * in `@/server/bootstrap/analytics-lifecycle`): incremental vacuum,
 * optimize, page stats. Full VACUUM is never scheduled.
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
  // Pragmas are no-ops inside transactions — run on the raw client.
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

// The handle getter is injected at wire time so a reopened handle
// (restore completion) is picked up without module state.

let job: ScheduledJob | null = null
let resolveHandle: (() => DatabaseHandle) | null = null

export function wireDbMaintenanceScheduler(deps: { getHandle: () => DatabaseHandle }): void {
  resolveHandle = deps.getHandle
}

export function scheduleNextDbMaintenance(): void {
  job ??= scheduleJob({
    name: 'db.maintenance',
    nextDelayMs: nextDailyMaintenanceDelayMs,
    run: () => {
      if (resolveHandle === null) {
        throw new Error('db maintenance fired before wireDbMaintenanceScheduler')
      }
      runDbMaintenance(resolveHandle())
    },
  })
  job.reschedule()
}
