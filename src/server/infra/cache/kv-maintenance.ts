import { lt } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'

import { sweepBucket } from '@/server/infra/cache/file-store'
import { oneTimeToken } from '@/server/infra/db/schema/one-time-token'
import { session } from '@/server/infra/db/schema/session'
import { jobDb, registerJob } from '@/server/infra/job-registry'
import { getLogger } from '@/server/infra/logger'
import { CACHE_DECLARATIONS } from '@/shared/cache/registry'

const log = getLogger('kv.maintenance')

// Fixed hourly interval — infra hygiene, not a site-timezone wall-clock job.
const SWEEP_INTERVAL_MS = 60 * 60 * 1000

/**
 * Hourly sweep: auth-state rows in SQLite, disposable entries on the
 * filesystem. Each cache bucket is isolated — one unreadable bucket logs and
 * lets every other bucket (and both DB legs) finish.
 */
export async function sweepExpiredKvEntries(db: Database): Promise<void> {
  const now = new Date()
  await db.delete(oneTimeToken).where(lt(oneTimeToken.expiresAt, now))
  await db.delete(session).where(lt(session.expiresAt, now))
  await sweepFileCache()
}

/** Filesystem leg: expired entries, aged `_tmp` orphans, and aged trash dirs. */
export async function sweepFileCache(now: number = Date.now()): Promise<void> {
  for (const declaration of CACHE_DECLARATIONS) {
    try {
      await sweepBucket(declaration.id, now)
    } catch (error) {
      log.warn('cache file sweep failed', { bucket: declaration.id, error })
    }
  }
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
