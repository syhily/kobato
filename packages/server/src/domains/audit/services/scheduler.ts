import { runArchiveJob } from '@kobato/server/domains/audit/services/archive'
import { jobDb, registerJob, scheduleRegisteredJob } from '@kobato/server/infra/job-registry'
import { getLogger } from '@kobato/server/infra/logger'
import { computeNextRun } from '@kobato/server/infra/scheduler-utils'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters'

const log = getLogger('audit.scheduler')

registerJob({
  name: 'audit.scheduler',
  task: { key: 'audit-archive', recordHistory: true },
  nextDelayMs: () => {
    const bundle = getBlogSettingsBundleSync()
    if (!bundle) {
      log.warn('Settings not hydrated; audit archive suspended')
      return null
    }
    const timeZone = bundle.siteIdentity?.timeZone ?? 'UTC'
    const delayMs =
      computeNextRun({ frequency: 'daily', hour: 4, minute: 0 }, timeZone, new Date()).getTime() - Date.now()
    log.info('Next audit archive scheduled', { delayMs })
    return delayMs
  },
  run: async () => {
    await runArchiveJob(jobDb())
  },
})

export async function rescheduleArchive(): Promise<void> {
  log.info('Rescheduling audit archive due to settings change')
  scheduleRegisteredJob('audit.scheduler')
}
