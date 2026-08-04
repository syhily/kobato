import type { Database } from '@kobato/server/infra/db/database'

import { kvCache } from '@kobato/server/infra/db/schema/kv-cache'
import { oneTimeToken } from '@kobato/server/infra/db/schema/one-time-token'
import { session } from '@kobato/server/infra/db/schema/session'
import { getLogger } from '@kobato/server/infra/logger'
import { scheduleJob, type ScheduledJob } from '@kobato/server/infra/scheduler-utils'
import { and, isNotNull, lt } from 'drizzle-orm'

const log = getLogger('kv.maintenance')

// Fixed hourly interval — the sweep is infra hygiene, not a site-timezone
// wall-clock job, so it doesn't go through `computeNextRun`.
const SWEEP_INTERVAL_MS = 60 * 60 * 1000

/**
 * Delete every expired row from the three PG replacement tables. Reads
 * already filter expired rows lazily (see `kv-store.ts`); this sweep
 * reclaims the space. NULL `expires_at` on `kv_cache` means "never
 * expires" and is deliberately kept.
 */
export async function sweepExpiredKvEntries(db: Database): Promise<void> {
  const now = new Date()
  await db.delete(kvCache).where(and(isNotNull(kvCache.expiresAt), lt(kvCache.expiresAt, now)))
  await db.delete(oneTimeToken).where(lt(oneTimeToken.expiresAt, now))
  await db.delete(session).where(lt(session.expiresAt, now))
}

// ─── Scheduler ───────────────────────────────────────────
// The db getter is injected by the composition root
// (`@kobato/server/bootstrap/db-lifecycle`) at wire time — a direct import of
// db-lifecycle here would make infra depend on bootstrap. The getter is
// invoked when the job fires, so a reopened handle (restore completion)
// is picked up without being captured in module state. Timer mechanics
// live in the shared `scheduleJob` seam.

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
