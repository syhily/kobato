import { copyFile } from 'node:fs/promises'

import type { AnalyticsReader } from '@/server/domains/analytics/services/duckdb-sql'

import { ManagedEngine } from '@/server/bootstrap/managed-engine'
import { ACCESS_LOG_DDL } from '@/server/domains/analytics/services/access-log'
import { wireAccessLogBatcher } from '@/server/domains/analytics/services/batcher'
import { runAccessLogRetention } from '@/server/domains/analytics/services/maintenance'
import {
  type AnalyticsHandle,
  closeAnalyticsDatabase,
  openAnalyticsDatabase,
  resolveAnalyticsPath,
} from '@/server/infra/analytics/duckdb'
import { getBatcher } from '@/server/infra/db/batcher-registry'
import { nextDailyMaintenanceDelayMs, scheduleJob, type ScheduledJob } from '@/server/infra/scheduler-utils'

/**
 * Boot-time owner of the DuckDB sidecar and the daily 180-day retention
 * job (same 04:30 slot as the SQLite half). The engine's priority-0
 * shutdown hook runs after the priority-100 batcher flushes.
 */
const engine = new ManagedEngine<AnalyticsHandle>(
  {
    open: () => openAnalyticsDatabase(resolveAnalyticsPath(), ACCESS_LOG_DDL),
    close: closeAnalyticsDatabase,
  },
  'analyticsHandle',
)

// Lazy writer getter so the domain batcher never imports this module back.
wireAccessLogBatcher({ getWriter: () => engine.get().writer })

let maintenanceJob: ScheduledJob | null = null

// Serialize the backup (CHECKPOINT+copy) and retention (DELETE) windows:
// copyFile is external to the writer, so a mid-copy DELETE would archive a
// straddled file.
let analyticsMutationLock: Promise<void> = Promise.resolve()

async function withAnalyticsMutationLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = analyticsMutationLock
  let release!: () => void
  analyticsMutationLock = new Promise<void>((resolve) => {
    release = resolve
  })
  await previous
  try {
    return await fn()
  } finally {
    release()
  }
}

/** The maintenance job body (shared by scheduler and tests); runs under the same mutation lock as backup snapshots. */
export async function runAnalyticsMaintenance(): Promise<void> {
  const handle = engine.peek()
  if (handle === null) {
    return
  }
  await withAnalyticsMutationLock(() => runAccessLogRetention(handle))
}

export function scheduleNextAnalyticsMaintenance(): void {
  maintenanceJob ??= scheduleJob({
    name: 'analytics.maintenance',
    nextDelayMs: nextDailyMaintenanceDelayMs,
    run: runAnalyticsMaintenance,
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

/** Test seam: adopt a test-owned temp-file handle; reset between cases. */
export function __adoptAnalyticsHandleForTests(handle: AnalyticsHandle): void {
  engine.adopt(handle)
}

/** Test seam: forget the adopted handle (does not close it). */
export function __resetAnalyticsEngineForTests(): void {
  engine.reset()
}

/** The MVCC-safe read connection; query call sites never touch the handle. */
export function getAnalyticsReader(): AnalyticsReader {
  return getAnalyticsHandle().reader
}

/** Checkpoint + copy the sidecar to `stagingPath` for a backup archive; false when the handle is in-memory, errors propagate. The access-log batcher stays paused across the window. */
export async function snapshotAnalyticsTo(stagingPath: string): Promise<boolean> {
  const handle = getAnalyticsHandle()
  if (handle.inMemory) {
    return false
  }
  return withAnalyticsMutationLock(async () => {
    // Via the registry's uniform pause/resume seam, keyed by the batcher's registration name.
    const batcher = getBatcher('AccessLogBatcher')
    await batcher?.pause?.()
    try {
      await handle.writer.run('CHECKPOINT')
      await copyFile(handle.path, stagingPath)
    } finally {
      batcher?.resume?.()
    }
    return true
  })
}

/** Close the sidecar for the restore file swap; the maintenance job is stopped first. */
export async function closeAnalyticsForRestore(): Promise<void> {
  if (maintenanceJob !== null) {
    maintenanceJob.stop()
    maintenanceJob = null
  }
  await engine.closeForSwap()
}
