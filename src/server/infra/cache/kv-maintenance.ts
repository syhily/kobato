import { and, isNotNull, lt } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'

import { kvCache } from '@/server/infra/db/schema/kv-cache'
import { oneTimeToken } from '@/server/infra/db/schema/one-time-token'
import { session } from '@/server/infra/db/schema/session'
import { registerShutdownHook } from '@/server/infra/lifecycle'
import { getLogger } from '@/server/infra/logger'

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
// Same structure as `@/server/domains/audit/services/scheduler`: a single
// self-rescheduling timeout, stopped via a shutdown hook.

let sweepTimer: NodeJS.Timeout | null = null

// The db getter is injected by the composition root
// (`@/server/bootstrap/db-lifecycle`) at pool-wire time — a direct import
// of db-lifecycle here would make infra depend on bootstrap. The getter is
// invoked when the timer fires, so a recreated pool (restore completion)
// is picked up without being captured in module state.
let resolveDb: (() => Database) | null = null

export function wireKvSweepScheduler(deps: { getDb: () => Database }): void {
  resolveDb = deps.getDb
}

export function scheduleNextKvSweep(): void {
  if (sweepTimer) {
    clearTimeout(sweepTimer)
    sweepTimer = null
  }

  sweepTimer = setTimeout(() => {
    void (async () => {
      try {
        if (!resolveDb) {
          throw new Error('kv sweep fired before wireKvSweepScheduler')
        }
        await sweepExpiredKvEntries(resolveDb())
        log.info('Expired kv entries swept')
      } catch (error) {
        log.error('KV sweep failed', { error })
      } finally {
        scheduleNextKvSweep()
      }
    })()
  }, SWEEP_INTERVAL_MS)
}

export function stopKvSweepScheduler(): void {
  if (sweepTimer) {
    clearTimeout(sweepTimer)
    sweepTimer = null
  }
}

registerShutdownHook(async () => {
  stopKvSweepScheduler()
}, 0)
