import { createBackup, cleanupOldBackups } from '@kobato/server/domains/backup/services/backup'
import { DomainError } from '@kobato/server/infra/http/errors'
import { jobDb, registerJob, scheduleRegisteredJob } from '@kobato/server/infra/job-registry'
import { getLogger } from '@kobato/server/infra/logger'
import { computeNextRun } from '@kobato/server/infra/scheduler-utils'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters'

const log = getLogger('backup.scheduler')

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
    if (error instanceof DomainError && error.code === 'CONFLICT') {
      log.info('Scheduled backup skipped; another backup is in progress')
      return
    }
    log.error('Scheduled backup job failed', { error })
  }
}

function nextBackupDelayMs(): number | null {
  const bundle = getBlogSettingsBundleSync()
  if (!bundle) {
    log.warn('Settings not hydrated; backup schedule suspended')
    return null
  }

  const backupSettings = bundle.backup
  if (!backupSettings?.scheduled.enabled) {
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
  task: { key: 'backup', recordHistory: true },
  nextDelayMs: nextBackupDelayMs,
  run: runBackupJob,
})

export async function rescheduleBackup(): Promise<void> {
  log.info('Rescheduling backup due to settings change')
  scheduleRegisteredJob('backup.scheduler')
}
