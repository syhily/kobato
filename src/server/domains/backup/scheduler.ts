import { computeNextRun } from '@/server/domains/backup/scheduler-utils'
import { checkPgToolsAvailable, cleanupOldBackups, createBackup } from '@/server/domains/backup/service'
import { getLogger } from '@/server/infra/logger'
import { registerShutdownHook } from '@/server/infra/shutdown'
import { getBlogSettingsBundleSync } from '@/shared/config/blog'

const log = getLogger('backup.scheduler')

let backupTimer: NodeJS.Timeout | null = null

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
    // Settings not hydrated yet (boot-time race); retry shortly.
    backupTimer = setTimeout(() => scheduleNextBackup(), 30_000)
    return
  }

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
      void runBackupJob().then(() => scheduleNextBackup())
    }, 60_000)
    return
  }

  log.info('Next backup scheduled', {
    at: nextRun.toISOString(),
    delayMs,
    frequency: backupSettings.scheduled.frequency,
  })

  backupTimer = setTimeout(() => {
    void runBackupJob().then(() => scheduleNextBackup())
  }, delayMs)
}

export function rescheduleBackup(): void {
  log.info('Rescheduling backup due to settings change')
  scheduleNextBackup()
}

export function stopBackupScheduler(): void {
  if (backupTimer) {
    clearTimeout(backupTimer)
    backupTimer = null
  }
}

registerShutdownHook(async () => {
  stopBackupScheduler()
})
