import {
  type AnalyticsHandle,
  closeAnalyticsDatabase,
  openAnalyticsDatabase,
  resolveAnalyticsPath,
} from '@/server/infra/analytics/duckdb'
import { registerShutdownHook } from '@/server/infra/lifecycle'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('analytics.lifecycle')

/**
 * Boot-time owner of the DuckDB sidecar: opens it alongside the content
 * database, closes it after every batcher has flushed (priority 0 —
 * batchers flush at 100, this runs after). The daily maintenance job
 * (retention DELETE + CHECKPOINT) is wired here too — same lifecycle
 * timer seam as the other sweeps.
 */
let current: AnalyticsHandle | null = null
let maintenanceTimer: NodeJS.Timeout | null = null

const RETENTION_DAYS = 180
const MAINTENANCE_INTERVAL_MS = 24 * 60 * 60 * 1000

async function runMaintenance(handle: AnalyticsHandle): Promise<void> {
  try {
    const before = await handle.reader.runAndReadAll('SELECT count(*) AS c FROM access_log')
    const beforeCount = before.getRowObjects()[0]?.c

    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const deleted = await handle.writer.runAndReadAll(`DELETE FROM access_log WHERE ts < epoch_ms(?::BIGINT)`, [
      BigInt(cutoff.getTime()),
    ])
    void deleted
    await handle.writer.run('CHECKPOINT')

    const after = await handle.reader.runAndReadAll('SELECT count(*) AS c FROM access_log')
    const afterCount = after.getRowObjects()[0]?.c
    log.info('analytics maintenance completed', {
      retentionDays: RETENTION_DAYS,
      rowsBefore: beforeCount,
      rowsAfter: afterCount,
    })
  } catch (error) {
    log.error('analytics maintenance failed', { error: error instanceof Error ? error.message : String(error) })
  }
}

function wireMaintenance(handle: AnalyticsHandle): void {
  if (maintenanceTimer !== null) {
    clearTimeout(maintenanceTimer)
  }
  maintenanceTimer = setInterval(() => {
    void runMaintenance(handle)
  }, MAINTENANCE_INTERVAL_MS)
  maintenanceTimer.unref()
}

export async function initAnalyticsDatabase(): Promise<void> {
  current = await openAnalyticsDatabase(resolveAnalyticsPath())
  wireMaintenance(current)
}

export function getAnalyticsHandle(): AnalyticsHandle {
  if (current === null) {
    throw new Error('Analytics database not initialized')
  }
  return current
}

registerShutdownHook(async () => {
  if (maintenanceTimer !== null) {
    clearInterval(maintenanceTimer)
    maintenanceTimer = null
  }
  if (current !== null) {
    await closeAnalyticsDatabase(current)
    current = null
  }
}, 0)
