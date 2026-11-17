import type { Database } from '@kobato/db/database.ts'
import type { AnalyticsHandle } from '@kobato/db/duckdb/database.ts'
import type { AnalyticsReader } from '@kobato/db/duckdb/query.ts'

import { runAnalyticsBlobMigrationAtBoot } from '@kobato/db/duckdb/blob-migration.ts'
import { closeAnalyticsDatabase, openAnalyticsDatabase } from '@kobato/db/duckdb/database.ts'
import { runAccessLogRetention } from '@kobato/db/duckdb/maintenance.ts'
import { ANALYTICS_DDL } from '@kobato/db/duckdb/schema.ts'
import { ManagedEngine } from '@kobato/server/bootstrap/managed-engine.ts'
import { wireAnalyticsQueryTelemetry } from '@kobato/server/domains/analytics/services/analytics-sql.ts'
import { wireAccessLogBatcher } from '@kobato/server/domains/analytics/services/batcher.ts'
import { wireDeviceEnvBeaconBatcher } from '@kobato/server/domains/analytics/services/env-beacon.ts'
import { getBatcher } from '@kobato/server/infra/db/batcher-registry.ts'
import { resolveAnalyticsPath } from '@kobato/server/infra/db/paths.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'
import { nextDailyMaintenanceDelayMs, scheduleJob, type ScheduledJob } from '@kobato/server/infra/scheduler-utils.ts'
import { copyFile } from 'node:fs/promises'

/** Boot-time owner of the DuckDB sidecar and the daily 180-day retention job (the 04:30
 *  slot shared with the SQLite half). The engine's priority-0 shutdown hook runs after
 *  the priority-100 batcher flushes. */
const engine = new ManagedEngine<AnalyticsHandle>(
  {
    open: () => openAnalyticsDatabase(resolveAnalyticsPath(), ANALYTICS_DDL, getLogger('analytics.duckdb')),
    close: closeAnalyticsDatabase,
  },
  'analyticsHandle',
)

// Lazy writer getter so the domain batchers never import this module back.
wireAccessLogBatcher({ getWriter: () => engine.get().writer })
wireDeviceEnvBeaconBatcher({ getWriter: () => engine.get().writer })

let maintenanceJob: ScheduledJob | null = null

// Serialize the backup (CHECKPOINT+copy) and retention (DELETE) windows: copyFile is
// external to the writer, so a mid-copy DELETE would archive a straddled file.
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
  await withAnalyticsMutationLock(() => runAccessLogRetention(handle, getLogger('analytics.maintenance')))
}

export function scheduleNextAnalyticsMaintenance(): void {
  maintenanceJob ??= scheduleJob({
    name: 'analytics.maintenance',
    task: { key: 'analytics-retention', recordHistory: true },
    nextDelayMs: nextDailyMaintenanceDelayMs,
    run: runAnalyticsMaintenance,
  })
  maintenanceJob.reschedule()
}

export async function initAnalyticsDatabase(db: Database): Promise<void> {
  // Dashboard queries executed inside @kobato/db carry the db.duckdb.query boundary.
  // Wired here (before engine.init) rather than at import time: importing this
  // module must stay side-effect-free.
  wireAnalyticsQueryTelemetry()
  await engine.init()
  // Legacy `access_log` → `access_events` conversion: once per database, before the
  // maintenance scheduler arms and before requests can push into the batcher.
  await withAnalyticsMutationLock(() =>
    runAnalyticsBlobMigrationAtBoot(db, engine.get(), getLogger('analytics.blob-migration')),
  )
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

/** Checkpoint + copy the sidecar to `stagingPath` for a backup archive; false when the
 *  handle is in-memory. Every sidecar-writing batcher stays paused across the window. */
export async function snapshotAnalyticsTo(stagingPath: string): Promise<boolean> {
  const handle = getAnalyticsHandle()
  if (handle.inMemory) {
    return false
  }
  return withAnalyticsMutationLock(async () => {
    const batchers = [getBatcher('AccessLogBatcher'), getBatcher('DeviceEnvBeaconBatcher')]
    for (const batcher of batchers) {
      await batcher?.pause?.()
    }
    try {
      await handle.writer.run('CHECKPOINT')
      await copyFile(handle.path, stagingPath)
    } finally {
      for (const batcher of batchers) {
        batcher?.resume?.()
      }
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
