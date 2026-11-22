import type { Database } from '@kobato/db/database'

import { CACHE_DECLARATIONS } from '@kobato/cache/registry'
import { purgeExpiredOneTimeTokens } from '@kobato/db/operations/one-time-token'
import { purgeExpiredSessions } from '@kobato/db/operations/session'
import { sweepBucket } from '@kobato/server/infra/cache/file-store'
import { jobDb, registerJob } from '@kobato/server/infra/job-registry'
import { getLogger } from '@kobato/server/infra/logger'

const log = getLogger('kv.maintenance')

const SWEEP_INTERVAL_MS = 60 * 60 * 1000

export async function sweepExpiredKvEntries(db: Database): Promise<void> {
  const now = new Date()
  await purgeExpiredOneTimeTokens(db, now)
  await purgeExpiredSessions(db, now)
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
