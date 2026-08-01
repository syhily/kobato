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

// Inject the access-log batcher's writer getter here, where the handle
// lives — the batcher (a domain service) must not import this bootstrap
// module back, so the composition root hands it a lazy getter instead.
// Flush-time resolution keeps handles adopted by tests reachable.
wireAccessLogBatcher({ getWriter: () => engine.get().writer })

let maintenanceJob: ScheduledJob | null = null

// One mutation window at a time across the two multi-statement DuckDB
// jobs: the backup's CHECKPOINT + file copy and the daily retention
// DELETE + CHECKPOINT. DuckDB's single writer serializes individual
// statements, but the backup's copyFile is EXTERNAL to the writer — a
// retention DELETE landing between the backup's CHECKPOINT and its copy
// would archive a file that straddles a mutation. A promise chain
// suffices: both jobs are async, neither window is long, and neither
// body re-enters the lock (the batcher's paused flush writes directly).
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

/** The maintenance job's body, one path for the scheduler and for tests:
 *  the retention DELETE + CHECKPOINT runs under the same mutation lock
 *  as a backup snapshot, so a backup firing at 04:30 cannot copy a file
 *  the retention job is mid-DELETE on. */
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

/** Test seam: place a test-owned handle (a real temp-file DuckDB)
 *  inside the engine so getAnalyticsHandle/getAnalyticsReader/
 *  snapshotAnalyticsTo run for real. Reset between cases. */
export function __adoptAnalyticsHandleForTests(handle: AnalyticsHandle): void {
  engine.adopt(handle)
}

/** Test seam: forget the adopted handle (does not close it). */
export function __resetAnalyticsEngineForTests(): void {
  engine.reset()
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
 *
 * The access-log batcher is PAUSED across the CHECKPOINT + copy window
 * (drain first, then hold appends) so the archived file can't straddle
 * an in-flight batch insert; the finally-resume runs even when the
 * checkpoint or copy throws. The whole window runs under the module's
 * mutation lock, so the daily retention DELETE + CHECKPOINT (which holds
 * the same lock) can never interleave a mutation between the backup's
 * checkpoint and its copy either.
 */
export async function snapshotAnalyticsTo(stagingPath: string): Promise<boolean> {
  const handle = getAnalyticsHandle()
  if (handle.inMemory) {
    return false
  }
  return withAnalyticsMutationLock(async () => {
    // Reached through the registry's optional pause/resume seam rather
    // than the batcher module's own API — the registry is the uniform
    // cross-batcher control surface (init/flush/reset/replay go through
    // it too). The name is the batcher's own registration key
    // (`domains/analytics/services/batcher.ts`).
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
