import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { runArchiveJob } from '@/server/domains/audit/archive'
import { getLogger } from '@/server/infra/logger'
import { registerShutdownHook } from '@/server/infra/shutdown'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

const log = getLogger('audit.scheduler')

let archiveTimer: NodeJS.Timeout | null = null
let archivedDb: NodePgDatabase | undefined
let archivedPool: Pool | undefined

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

export function scheduleNextArchive(db: NodePgDatabase, pool: Pool): void {
  if (archiveTimer) {
    clearTimeout(archiveTimer)
    archiveTimer = null
  }
  archivedDb = db
  archivedPool = pool

  const bundle = getBlogSettingsBundleSync()
  if (!bundle) {
    // Settings not hydrated yet (boot-time race); retry shortly.
    archiveTimer = setTimeout(() => scheduleNextArchive(db, pool), 30_000)
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
    const cachedDb = archivedDb
    const cachedPool = archivedPool
    if (cachedDb && cachedPool) {
      void (async () => {
        await runArchiveJob(cachedDb, cachedPool)
        scheduleNextArchive(cachedDb, cachedPool)
      })()
    }
  }, delayMs)
}

export async function rescheduleArchive(db: NodePgDatabase, pool: Pool): Promise<void> {
  log.info('Rescheduling audit archive due to settings change')
  scheduleNextArchive(db, pool)
}

export function stopArchiveScheduler(): void {
  if (archiveTimer) {
    clearTimeout(archiveTimer)
    archiveTimer = null
  }
}

registerShutdownHook(async () => {
  stopArchiveScheduler()
})
