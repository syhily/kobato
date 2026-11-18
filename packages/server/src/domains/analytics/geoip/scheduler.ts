import { runScheduledGeoipUpdate } from '@kobato/server/domains/analytics/geoip/update.ts'
import { registerJob, scheduleRegisteredJob } from '@kobato/server/infra/job-registry.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'
import { computeNextRun } from '@kobato/server/infra/scheduler-utils.ts'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters.ts'

const log = getLogger('analytics.geoip-scheduler')

registerJob({
  name: 'analytics.geoip-scheduler',
  task: { key: 'geoip-update', recordHistory: true },
  nextDelayMs: () => {
    const bundle = getBlogSettingsBundleSync()
    if (!bundle) {
      log.warn('Settings not hydrated; GeoIP auto-update suspended')
      return null
    }
    if (!bundle.analytics?.analytics.geoipAutoUpdate) {
      // Returning null suspends the job; the seam re-evaluates periodically,
      // so a settings toggle takes effect without an explicit reschedule.
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

export async function rescheduleGeoipUpdate(): Promise<void> {
  log.info('Rescheduling GeoIP auto-update due to settings change')
  scheduleRegisteredJob('analytics.geoip-scheduler')
}
