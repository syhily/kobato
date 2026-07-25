import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { runArchiveJob } from '@/server/domains/audit/services/archive'
import { registerShutdownHook } from '@/server/infra/lifecycle'
import { getLogger } from '@/server/infra/logger'
import { computeNextRun } from '@/server/infra/scheduler-utils'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

const log = getLogger('audit.scheduler')

let archiveTimer: NodeJS.Timeout | null = null

// Scheduler — daily at 04:00 in the site's configured timezone, same
// wall-clock semantics as the backup scheduler.

// The db getter is injected by the composition root
// (`@/server/bootstrap/db-lifecycle`, which imports this module) at
// pool-wire time — a direct import of db-lifecycle here would close an
// import cycle. The getter is invoked when the timer fires, so a
// recreated pool (restore completion) is picked up without being
// captured in module state. Same injection discipline as
// `setRestartDb` / `setRestartRefreshSettings` in `@/server/infra/lifecycle`.
let resolveDb: (() => NodePgDatabase) | null = null

export function wireArchiveScheduler(deps: { getDb: () => NodePgDatabase }): void {
  resolveDb = deps.getDb
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
  const timeZone = bundle.siteIdentity?.timeZone ?? 'UTC'
  const nextRun = computeNextRun({ frequency: 'daily', hour: 4, minute: 0 }, timeZone, now)
  const delayMs = nextRun.getTime() - now.getTime()

  log.info('Next audit archive scheduled', {
    at: nextRun.toISOString(),
    delayMs,
  })

  archiveTimer = setTimeout(() => {
    void (async () => {
      try {
        if (!resolveDb) {
          throw new Error('archive scheduler fired before wireArchiveScheduler')
        }
        await runArchiveJob(resolveDb())
        scheduleNextArchive()
      } catch (error) {
        log.error('Archive scheduler callback failed', { error })
      }
    })()
  }, delayMs)
}

export async function rescheduleArchive(): Promise<void> {
  log.info('Rescheduling audit archive due to settings change')
  scheduleNextArchive()
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
