import { createBackup, cleanupOldBackups } from '@/server/domains/backup/services/backup'
import { DomainError } from '@/server/infra/http/errors'
import { jobDb, registerJob, scheduleRegisteredJob } from '@/server/infra/job-registry'
import { getLogger } from '@/server/infra/logger'
import { computeNextRun } from '@/server/infra/scheduler-utils'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

const log = getLogger('backup.scheduler')

// The job registry owns boot start-up and the shared db getter; the db is
// read at fire time so a recreated handle (restore) is picked up.
let hydrationRetryAttempt = 0

async function runBackupJob(): Promise<void> {
  try {
    const db = jobDb()
    const result = await createBackup(db, null)
    log.info('Scheduled backup created', result)

    const bundle = getBlogSettingsBundleSync()
    const backupSettings = bundle?.backup
    if (backupSettings?.retention.enabled) {
      await cleanupOldBackups(db, backupSettings.retention.days)
    }
  } catch (error) {
    // Another backup holds the single-flight slot — skipping is expected.
    if (error instanceof DomainError && error.code === 'CONFLICT') {
      log.info('Scheduled backup skipped; another backup is in progress')
      return
    }
    log.error('Scheduled backup job failed', { error })
  }
}

// Domain scheduling policy; the shared `scheduleJob` seam owns the timer.
function nextBackupDelayMs(): number | null {
  const bundle = getBlogSettingsBundleSync()
  if (!bundle) {
    // Settings not hydrated yet (boot-time race) — retry with backoff.
    hydrationRetryAttempt += 1
    const delayMs = Math.min(5000 * 2 ** (hydrationRetryAttempt - 1), 300_000)
    log.warn('Settings not hydrated; retrying backup schedule', {
      attempt: hydrationRetryAttempt,
      delayMs,
    })
    return delayMs
  }
  hydrationRetryAttempt = 0

  const backupSettings = bundle.backup
  // Backups run regardless of S3 config — S3 off lands them in local storage.
  if (!backupSettings?.scheduled.enabled) {
    // Suspended — the seam re-evaluates periodically, so toggling on takes effect.
    return null
  }

  const timeZone = bundle.siteIdentity?.timeZone ?? 'UTC'
  const nextRun = computeNextRun(backupSettings.scheduled, timeZone, new Date())
  const delayMs = nextRun.getTime() - Date.now()

  if (delayMs <= 0) {
    log.warn('Calculated next backup time is in the past; scheduling in 1 minute')
    return 60_000
  }

  log.info('Next backup scheduled', {
    at: nextRun.toISOString(),
    delayMs,
    frequency: backupSettings.scheduled.frequency,
  })
  return delayMs
}

registerJob({
  name: 'backup.scheduler',
  nextDelayMs: nextBackupDelayMs,
  run: runBackupJob,
})

export async function rescheduleBackup(): Promise<void> {
  log.info('Rescheduling backup due to settings change')
  hydrationRetryAttempt = 0
  scheduleRegisteredJob('backup.scheduler')
}
