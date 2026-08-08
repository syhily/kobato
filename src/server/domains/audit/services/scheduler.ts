import type { Database } from '@/server/infra/db/database'

import { runArchiveJob } from '@/server/domains/audit/services/archive'
import { getLogger } from '@/server/infra/logger'
import { computeNextRun, scheduleJob, type ScheduledJob } from '@/server/infra/scheduler-utils'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

const log = getLogger('audit.scheduler')

// Daily 04:00 archive scheduler in the site's configured timezone.
// Domain owns only next-fire policy; timer mechanics live in `scheduleJob`.

// Injected getter (avoids an import cycle), re-read at fire time so a recreated pool is picked up.
let resolveDb: (() => Database) | null = null
let job: ScheduledJob | null = null

export function wireArchiveScheduler(deps: { getDb: () => Database }): void {
  resolveDb = deps.getDb
}

export function scheduleNextArchive(): void {
  job ??= scheduleJob({
    name: 'audit.scheduler',
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
      if (!resolveDb) {
        throw new Error('archive scheduler fired before wireArchiveScheduler')
      }
      await runArchiveJob(resolveDb())
    },
  })
  job.reschedule()
}

export async function rescheduleArchive(): Promise<void> {
  log.info('Rescheduling audit archive due to settings change')
  scheduleNextArchive()
}
