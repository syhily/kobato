import type { DatabaseHandle } from '@kobato/db/database.ts'

import { pruneNotifications } from '@kobato/db/operations/notification.ts'
import { pruneJobRuns } from '@kobato/server/infra/db/job-run-recorder.ts'
import { jobHandle, registerJob } from '@kobato/server/infra/job-registry.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'
import { nextDailyMaintenanceDelayMs } from '@kobato/server/infra/scheduler-utils.ts'

const log = getLogger('db.maintenance')

function pragmaNumber(handle: DatabaseHandle, pragma: string): number {
  const row = handle.client.prepare(`PRAGMA ${pragma}`).get()
  const value = row === undefined ? undefined : Object.values(row)[0]
  return typeof value === 'number' ? value : Number(value ?? 0)
}

function pageStats(handle: DatabaseHandle): { pageCount: number; freelistCount: number } {
  return { pageCount: pragmaNumber(handle, 'page_count'), freelistCount: pragmaNumber(handle, 'freelist_count') }
}

export function runDbMaintenance(handle: DatabaseHandle): void {
  try {
    const before = pageStats(handle)
    handle.client.exec('PRAGMA incremental_vacuum')
    handle.client.exec('PRAGMA optimize')
    const after = pageStats(handle)
    const jobRunsPruned = pruneJobRuns(handle.db)
    const { recipientsPruned: notificationRecipientsPruned, notificationsPruned } = pruneNotifications(handle.db)
    log.info('database maintenance completed', {
      pagesBefore: before.pageCount,
      pagesAfter: after.pageCount,
      freelistBefore: before.freelistCount,
      freelistAfter: after.freelistCount,
      jobRunsPruned,
      notificationRecipientsPruned,
      notificationsPruned,
    })
  } catch (error) {
    log.error('database maintenance failed', { error: error instanceof Error ? error.message : String(error) })
  }
}

registerJob({
  name: 'db.maintenance',
  task: { key: 'db-maintenance', recordHistory: true },
  nextDelayMs: nextDailyMaintenanceDelayMs,
  run: () => {
    runDbMaintenance(jobHandle())
  },
})
