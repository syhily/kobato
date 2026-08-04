import type { Database } from '@kobato/server/infra/db/database'

import { runArchiveJob } from '@kobato/server/domains/audit/services/archive'
import { getLogger } from '@kobato/server/infra/logger'
import { computeNextRun, scheduleJob, type ScheduledJob } from '@kobato/server/infra/scheduler-utils'
import { getBlogSettingsBundleSync } from '@kobato/shared/config/getters'

const log = getLogger('audit.scheduler')

// Scheduler — daily at 04:00 in the site's configured timezone, same
// wall-clock semantics as the backup scheduler. The domain owns only
// the policy (next-fire computation); timer mechanics live in the
// shared `scheduleJob` seam.

// The db getter is injected by the composition root
// (`@kobato/server/bootstrap/db-lifecycle`, which imports this module) at
// wire time — a direct import of db-lifecycle here would close an
// import cycle. The getter is invoked when the job fires, so a
// recreated pool (restore completion) is picked up without being
// captured in module state. Same injection discipline as
// `setRestartDb` / `setRestartRefreshSettings` in `@kobato/server/infra/lifecycle`.
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
        // Settings not hydrated yet (boot-time race) — suspend and let
        // the seam re-evaluate shortly.
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
