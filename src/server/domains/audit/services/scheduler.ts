import type { Pool } from 'pg'

import { drizzle } from 'drizzle-orm/node-postgres'

import { runArchiveJob } from '@/server/domains/audit/services/archive'
import { registerSectionChangeHandler } from '@/server/domains/settings/services/core'
import { registerShutdownHook } from '@/server/infra/lifecycle'
import { getLogger } from '@/server/infra/logger'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

const log = getLogger('audit.scheduler')

let archiveTimer: NodeJS.Timeout | null = null
let archivedPool: Pool | undefined

// Scheduler — daily at 04:00

function computeNextRun(now: Date, hour: number, minute: number): Date {
  const next = new Date(now)
  next.setHours(hour, minute, 0, 0)
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1)
  }
  return next
}

export function scheduleNextArchive(pool: Pool): void {
  if (archiveTimer) {
    clearTimeout(archiveTimer)
    archiveTimer = null
  }
  archivedPool = pool

  const bundle = getBlogSettingsBundleSync()
  if (!bundle) {
    // Settings not hydrated yet (boot-time race); retry shortly.
    archiveTimer = setTimeout(() => scheduleNextArchive(pool), 30_000)
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
    const cachedPool = archivedPool
    if (cachedPool) {
      void (async () => {
        const freshDb = drizzle({ client: cachedPool })
        await runArchiveJob(freshDb, cachedPool)
        scheduleNextArchive(cachedPool)
      })()
    }
  }, delayMs)
}

export async function rescheduleArchive(pool: Pool): Promise<void> {
  log.info('Rescheduling audit archive due to settings change')
  scheduleNextArchive(pool)
}

export function stopArchiveScheduler(): void {
  if (archiveTimer) {
    clearTimeout(archiveTimer)
    archiveTimer = null
  }
}

registerShutdownHook(async () => {
  stopArchiveScheduler()
}, 0)

registerSectionChangeHandler('limits', rescheduleArchive)
