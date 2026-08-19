import type { Database } from '@/server/infra/db/database'

import { purgeExpired } from '@/server/domains/auth/verification-tokens'
import { getLogger } from '@/server/infra/logger'
import { nextDailyMaintenanceDelayMs, scheduleJob, type ScheduledJob } from '@/server/infra/scheduler-utils'

const log = getLogger('auth.token-purge')

// Daily purge of verification rows expired for over a day, riding the shared
// 04:30 maintenance slot. Domain owns policy; timer mechanics live in
// `scheduleJob`.

// Injected getter, re-read at fire time so a reopened handle is picked up.
let resolveDb: (() => Database) | null = null
let job: ScheduledJob | null = null

export function wireTokenPurgeScheduler(deps: { getDb: () => Database }): void {
  resolveDb = deps.getDb
}

export function scheduleNextTokenPurge(): void {
  job ??= scheduleJob({
    name: 'auth.token-purge',
    nextDelayMs: nextDailyMaintenanceDelayMs,
    run: async () => {
      if (resolveDb === null) {
        throw new Error('token purge fired before wireTokenPurgeScheduler')
      }
      const deleted = await purgeExpired(resolveDb())
      if (deleted > 0) {
        log.info('purged expired verification tokens', { deleted })
      }
    },
  })
  job.reschedule()
}
