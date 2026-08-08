import type { Database } from '@/server/infra/db/database'

import { createBackup, cleanupOldBackups } from '@/server/domains/backup/services/backup'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { computeNextRun, scheduleJob, type ScheduledJob } from '@/server/infra/scheduler-utils'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

const log = getLogger('backup.scheduler')

// Db getter injected by the composition root at wire time (avoids an import cycle).
let resolveDb: (() => Database) | null = null
let job: ScheduledJob | null = null
let hydrationRetryAttempt = 0

export function wireBackupScheduler(deps: { getDb: () => Database }): void {
  resolveDb = deps.getDb
}

async function runBackupJob(): Promise<void> {
  if (!resolveDb) {
    throw new Error('backup scheduler fired before wireBackupScheduler')
  }
  try {
    const db = resolveDb()
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

export function scheduleNextBackup(): void {
  job ??= scheduleJob({
    name: 'backup.scheduler',
    nextDelayMs: nextBackupDelayMs,
    run: runBackupJob,
  })
  job.reschedule()
}

export async function rescheduleBackup(): Promise<void> {
  log.info('Rescheduling backup due to settings change')
  hydrationRetryAttempt = 0
  scheduleNextBackup()
}
