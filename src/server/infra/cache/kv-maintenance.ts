import { and, isNotNull, lt } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'

import { kvCache } from '@/server/infra/db/schema/kv-cache'
import { oneTimeToken } from '@/server/infra/db/schema/one-time-token'
import { session } from '@/server/infra/db/schema/session'
import { jobDb, registerJob } from '@/server/infra/job-registry'
import { getLogger } from '@/server/infra/logger'

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

// The db getter lives in the job registry and is invoked when the job
// fires — a reopened handle (restore completion) is picked up.

registerJob({
  name: 'kv.maintenance',
  task: { key: 'kv-sweep', recordHistory: true },
  nextDelayMs: () => SWEEP_INTERVAL_MS,
  run: async () => {
    await sweepExpiredKvEntries(jobDb())
    log.info('Expired kv entries swept')
  },
})
