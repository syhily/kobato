import { runArchiveJob } from '@/server/domains/audit/services/archive'
import { jobDb, registerJob, scheduleRegisteredJob } from '@/server/infra/job-registry'
import { getLogger } from '@/server/infra/logger'
import { computeNextRun } from '@/server/infra/scheduler-utils'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

const log = getLogger('audit.scheduler')

// Daily 04:00 archive scheduler in the site's configured timezone.
// Domain owns only next-fire policy; timer mechanics live in `scheduleJob`,
// and the job registry owns boot start-up.

registerJob({
  name: 'audit.scheduler',
  task: { key: 'audit-archive', recordHistory: true },
  nextDelayMs: () => {
    const bundle = getBlogSettingsBundleSync()
    if (!bundle) {
      // Boot-time race: suspend; the seam re-evaluates shortly.
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
