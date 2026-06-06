import { computeNextRun } from '@/server/domains/backup/scheduler-utils'
import { createBackup, cleanupOldBackups } from '@/server/domains/backup/services/backup'
import { checkPgToolsAvailable } from '@/server/domains/backup/services/shared'
import { registerSectionChangeHandler } from '@/server/domains/settings/services/core'
import { registerShutdownHook } from '@/server/infra/lifecycle'
import { getLogger } from '@/server/infra/logger'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

const log = getLogger('backup.scheduler')

let backupTimer: NodeJS.Timeout | null = null
let hydrationRetryAttempt = 0

async function runBackupJob(): Promise<void> {
  try {
    await checkPgToolsAvailable()
    const result = await createBackup()
    log.info('Scheduled backup created', result)

    const bundle = getBlogSettingsBundleSync()
    const backupSettings = bundle?.backup
    if (backupSettings?.retention.enabled) {
      await cleanupOldBackups(backupSettings.retention.days)
    }
  } catch (error) {
    log.error('Scheduled backup job failed', { error })
  }
}

export function scheduleNextBackup(): void {
  if (backupTimer) {
    clearTimeout(backupTimer)
    backupTimer = null
  }

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
    backupTimer = setTimeout(() => scheduleNextBackup(), delayMs)
    return
  }
  hydrationRetryAttempt = 0

  const backupSettings = bundle.backup
  const assets = bundle.assets
  if (!backupSettings?.scheduled.enabled || !assets?.storage.enabled) {
    return
  }

  const timeZone = bundle.siteIdentity?.timeZone ?? 'UTC'
  const nextRun = computeNextRun(backupSettings.scheduled, timeZone, new Date())
  const delayMs = nextRun.getTime() - Date.now()

  if (delayMs <= 0) {
    // Immediate fallback: if calculated time is in the past, run in 1 minute
    log.warn('Calculated next backup time is in the past; scheduling in 1 minute')
    backupTimer = setTimeout(() => {
      void (async () => {
        await runBackupJob()
        scheduleNextBackup()
      })()
    }, 60_000)
    return
  }

  log.info('Next backup scheduled', {
    at: nextRun.toISOString(),
    delayMs,
    frequency: backupSettings.scheduled.frequency,
  })

  backupTimer = setTimeout(() => {
    void (async () => {
      await runBackupJob()
      scheduleNextBackup()
    })()
  }, delayMs)
}

export async function rescheduleBackup(): Promise<void> {
  log.info('Rescheduling backup due to settings change')
  hydrationRetryAttempt = 0
  scheduleNextBackup()
}

export function stopBackupScheduler(): void {
  if (backupTimer) {
    clearTimeout(backupTimer)
    backupTimer = null
  }
}

export function initBackupScheduler(): void {
  registerShutdownHook(async () => {
    stopBackupScheduler()
  }, 0)
}

registerSectionChangeHandler('backup', () => rescheduleBackup())
