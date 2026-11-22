import type { DatabaseHandle } from '@kobato/db/database'

import { databaseOf } from '@kobato/db/database'
import { runSqlitePragmaMaintenance } from '@kobato/db/operations/maintenance'
import { pruneNotifications } from '@kobato/db/operations/notification'
import { pruneJobRuns } from '@kobato/server/infra/db/job-run-recorder'
import { jobHandle, registerJob } from '@kobato/server/infra/job-registry'
import { getLogger } from '@kobato/server/infra/logger'
import { nextDailyMaintenanceDelayMs } from '@kobato/server/infra/scheduler-utils'

const log = getLogger('db.maintenance')

export function runDbMaintenance(handle: DatabaseHandle): void {
  try {
    const { before, after } = runSqlitePragmaMaintenance(handle)
    const db = databaseOf(handle)
    const jobRunsPruned = pruneJobRuns(db)
    const { recipientsPruned: notificationRecipientsPruned, notificationsPruned } = pruneNotifications(db)
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
