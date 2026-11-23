import type { AnalyticsHandle, AnalyticsReader } from '@kobato/db/duckdb/connection'
import type { Database } from '@kobato/db/sqlite/database'

import { runAnalyticsBlobMigrationAtBoot } from '@kobato/db/duckdb/blob-migration'
import { analyticsReaderOf, analyticsWriterOf } from '@kobato/db/duckdb/connection'
import { checkpointAnalyticsDatabase, closeAnalyticsDatabase, openAnalyticsDatabase } from '@kobato/db/duckdb/database'
import { runAccessLogRetention } from '@kobato/db/duckdb/maintenance'
import { ANALYTICS_DDL } from '@kobato/db/duckdb/schema'
import { ManagedEngine } from '@kobato/server/bootstrap/managed-engine'
import { wireAnalyticsQueryTelemetry } from '@kobato/server/domains/analytics/services/analytics-sql'
import { wireAccessLogBatcher } from '@kobato/server/domains/analytics/services/batcher'
import { wireDeviceEnvBeaconBatcher } from '@kobato/server/domains/analytics/services/env-beacon'
import { getBatcher } from '@kobato/server/infra/db/batcher-registry'
import { resolveAnalyticsPath } from '@kobato/server/infra/db/paths'
import { getLogger } from '@kobato/server/infra/logger'
import { nextDailyMaintenanceDelayMs, scheduleJob, type ScheduledJob } from '@kobato/server/infra/scheduler-utils'
import { copyFile } from 'node:fs/promises'

const engine = new ManagedEngine<AnalyticsHandle>(
  {
    open: () => openAnalyticsDatabase(resolveAnalyticsPath(), ANALYTICS_DDL, getLogger('analytics.duckdb')),
    close: closeAnalyticsDatabase,
  },
  'analyticsHandle',
)

wireAccessLogBatcher({ getWriter: () => analyticsWriterOf(engine.get()) })
wireDeviceEnvBeaconBatcher({ getWriter: () => analyticsWriterOf(engine.get()) })

let maintenanceJob: ScheduledJob | null = null

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
  wireAnalyticsQueryTelemetry()
  await engine.init()
  await withAnalyticsMutationLock(() =>
    runAnalyticsBlobMigrationAtBoot(db, engine.get(), getLogger('analytics.blob-migration')),
  )
  scheduleNextAnalyticsMaintenance()
}

export function getAnalyticsHandle(): AnalyticsHandle {
  return engine.get()
}

export function __adoptAnalyticsHandleForTests(handle: AnalyticsHandle): void {
  engine.adopt(handle)
}

export function __resetAnalyticsEngineForTests(): void {
  engine.reset()
}

export function getAnalyticsReader(): AnalyticsReader {
  return analyticsReaderOf(getAnalyticsHandle())
}

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
      await checkpointAnalyticsDatabase(handle)
      await copyFile(handle.path, stagingPath)
    } finally {
      for (const batcher of batchers) {
        batcher?.resume?.()
      }
    }
    return true
  })
}

export async function closeAnalyticsForRestore(): Promise<void> {
  if (maintenanceJob !== null) {
    maintenanceJob.stop()
    maintenanceJob = null
  }
  await engine.closeForSwap()
}
