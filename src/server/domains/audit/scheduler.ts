import { runArchiveJob } from '@/server/domains/audit/archive'
import { getLogger } from '@/server/infra/logger'
import { getBlogSettingsBundleSync } from '@/shared/config/blog'

const log = getLogger('audit.scheduler')

let archiveTimer: NodeJS.Timeout | null = null

// ---------------------------------------------------------------------------
// Scheduler — daily at 04:00
// ---------------------------------------------------------------------------

function computeNextRun(now: Date, hour: number, minute: number): Date {
  const next = new Date(now)
  next.setHours(hour, minute, 0, 0)
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1)
  }
  return next
}

export function scheduleNextArchive(): void {
  if (archiveTimer) {
    clearTimeout(archiveTimer)
    archiveTimer = null
  }

  const bundle = getBlogSettingsBundleSync()
  if (!bundle) {
    // Settings not hydrated yet (boot-time race); retry shortly.
    archiveTimer = setTimeout(() => scheduleNextArchive(), 30_000)
    return
  }

  const now = new Date()
  const nextRun = computeNextRun(now, 4, 0)
  const delayMs = nextRun.getTime() - now.getTime()

  log.info('Next audit archive scheduled', {
    at: nextRun.toISOString(),
    delayMs,
  })

  archiveTimer = setTimeout(() => {
    void runArchiveJob().then(() => scheduleNextArchive())
  }, delayMs)
}

export function rescheduleArchive(): void {
  log.info('Rescheduling audit archive due to settings change')
  scheduleNextArchive()
}
