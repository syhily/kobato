import { and, isNotNull, lt } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'

import { kvCache } from '@/server/infra/db/schema/kv-cache'
import { oneTimeToken } from '@/server/infra/db/schema/one-time-token'
import { session } from '@/server/infra/db/schema/session'
import { getLogger } from '@/server/infra/logger'
import { scheduleJob, type ScheduledJob } from '@/server/infra/scheduler-utils'

const log = getLogger('kv.maintenance')

// Fixed hourly interval — infra hygiene, not a site-timezone wall-clock job.
const SWEEP_INTERVAL_MS = 60 * 60 * 1000

/**
 * Delete every expired row (reads filter lazily; this reclaims space).
 * NULL `expires_at` means "never expires" and is deliberately kept.
 */
export async function sweepExpiredKvEntries(db: Database): Promise<void> {
  const now = new Date()
  await db.delete(kvCache).where(and(isNotNull(kvCache.expiresAt), lt(kvCache.expiresAt, now)))
  await db.delete(oneTimeToken).where(lt(oneTimeToken.expiresAt, now))
  await db.delete(session).where(lt(session.expiresAt, now))
}

// The db getter is injected at wire time (infra must not import bootstrap) and
// invoked when the job fires — a reopened handle is picked up without module state.

let job: ScheduledJob | null = null
let resolveDb: (() => Database) | null = null

export function wireKvSweepScheduler(deps: { getDb: () => Database }): void {
  resolveDb = deps.getDb
}

export function scheduleNextKvSweep(): void {
  job ??= scheduleJob({
    name: 'kv.maintenance',
    nextDelayMs: () => SWEEP_INTERVAL_MS,
    run: async () => {
      if (!resolveDb) {
        throw new Error('kv sweep fired before wireKvSweepScheduler')
      }
      await sweepExpiredKvEntries(resolveDb())
      log.info('Expired kv entries swept')
    },
  })
  job.reschedule()
}
