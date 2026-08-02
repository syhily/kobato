import { runScheduledGeoipUpdate } from '@/server/domains/analytics/geoip-update'
import { getLogger } from '@/server/infra/logger'
import { computeNextRun, scheduleJob, type ScheduledJob } from '@/server/infra/scheduler-utils'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

const log = getLogger('analytics.geoip-scheduler')

// Daily GeoIP update check at 05:30 in the site's configured timezone —
// after the backup (03:00), audit archive (04:00), and engine maintenance
// (04:30) slots. The domain owns only the policy (enable gate + next-fire
// computation); timer mechanics live in the shared `scheduleJob` seam.
let job: ScheduledJob | null = null

export function scheduleNextGeoipUpdate(): void {
  job ??= scheduleJob({
    name: 'analytics.geoip-scheduler',
    nextDelayMs: () => {
      const bundle = getBlogSettingsBundleSync()
      if (!bundle) {
        // Settings not hydrated yet (boot-time race) — suspend and let
        // the seam re-evaluate shortly.
        log.warn('Settings not hydrated; GeoIP auto-update suspended')
        return null
      }
      if (!bundle.analytics?.analytics.geoipAutoUpdate) {
        // Suspended: the seam re-evaluates periodically, so toggling the
        // setting on takes effect without an explicit reschedule too.
        return null
      }
      const timeZone = bundle.siteIdentity?.timeZone ?? 'UTC'
      const delayMs =
        computeNextRun({ frequency: 'daily', hour: 5, minute: 30 }, timeZone, new Date()).getTime() - Date.now()
      log.info('Next GeoIP update check scheduled', { delayMs })
      return delayMs
    },
    run: runScheduledGeoipUpdate,
  })
  job.reschedule()
}

export async function rescheduleGeoipUpdate(): Promise<void> {
  log.info('Rescheduling GeoIP auto-update due to settings change')
  scheduleNextGeoipUpdate()
}
