import type { Database } from '@/server/infra/db/database'

import { createBackup, cleanupOldBackups } from '@/server/domains/backup/services/backup'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { computeNextRun, scheduleJob, type ScheduledJob } from '@/server/infra/scheduler-utils'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

const log = getLogger('backup.scheduler')

// The db getter is injected by the composition root
// (`@/server/bootstrap/db-lifecycle`, which imports this module) at
// wire time — a direct import of db-lifecycle here would close an
// import cycle. The getter is invoked when the job fires, so a
// recreated handle (restore completion) is picked up without being
// captured in module state. Same injection discipline as
// `wireArchiveScheduler` in `@/server/domains/audit/services/scheduler`.
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
    // The single-flight slot is held by a manual backup (or a still-running
    // previous tick) — skipping this run is expected, not a failure.
    if (error instanceof DomainError && error.code === 'CONFLICT') {
      log.info('Scheduled backup skipped; another backup is in progress')
      return
    }
    log.error('Scheduled backup job failed', { error })
  }
}

// The domain's scheduling POLICY as one closure (hydration backoff,
// enable gate, past-time fallback); the shared `scheduleJob` seam owns
// the timer mechanics.
function nextBackupDelayMs(): number | null {
  const bundle = getBlogSettingsBundleSync()
  if (!bundle) {
    // Settings not hydrated yet (boot-time race). Retry with
    // exponential backoff: 5s → 10s → 20s → … capped at 5 min.
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
  // Scheduled backups run regardless of whether S3 is enabled — when S3 is
  // off, backups land in local storage under `$DATA_PATH/storage/backup/`.
  if (!backupSettings?.scheduled.enabled) {
    // Suspended: the seam re-evaluates periodically, so toggling the
    // setting on takes effect without an explicit reschedule too.
    return null
  }

  const timeZone = bundle.siteIdentity?.timeZone ?? 'UTC'
  const nextRun = computeNextRun(backupSettings.scheduled, timeZone, new Date())
  const delayMs = nextRun.getTime() - Date.now()

  if (delayMs <= 0) {
    // Immediate fallback: if calculated time is in the past, run in 1 minute
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
