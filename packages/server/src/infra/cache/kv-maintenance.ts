import type { Database } from '@kobato/db/database.ts'

import { CACHE_DECLARATIONS } from '@kobato/cache/registry.ts'
import { oneTimeToken } from '@kobato/db/schema/one-time-token.ts'
import { session } from '@kobato/db/schema/session.ts'
import { sweepBucket } from '@kobato/server/infra/cache/file-store.ts'
import { jobDb, registerJob } from '@kobato/server/infra/job-registry.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'
import { lt } from 'drizzle-orm'

const log = getLogger('kv.maintenance')

const SWEEP_INTERVAL_MS = 60 * 60 * 1000

export async function sweepExpiredKvEntries(db: Database): Promise<void> {
  const now = new Date()
  await db.delete(oneTimeToken).where(lt(oneTimeToken.expiresAt, now))
  await db.delete(session).where(lt(session.expiresAt, now))
  await sweepFileCache()
}

export async function sweepFileCache(now: number = Date.now()): Promise<void> {
  for (const declaration of CACHE_DECLARATIONS) {
    try {
      await sweepBucket(declaration.id, now)
    } catch (error) {
      log.warn('cache file sweep failed', { bucket: declaration.id, error })
    }
  }
}

registerJob({
  name: 'kv.maintenance',
  task: { key: 'kv-sweep', recordHistory: true },
  nextDelayMs: () => SWEEP_INTERVAL_MS,
  run: async () => {
    await sweepExpiredKvEntries(jobDb())
    log.info('Expired kv entries swept')
  },
})
