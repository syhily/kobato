import type { ClearCacheTarget } from '@kobato/cache/types'
import type { AdminCacheStatsDto, ClearCacheResultDto } from '@kobato/contracts/cache'
import type { Database } from '@kobato/db/database'

import {
  clearAllBuckets,
  clearBucket,
  getBucket,
  getCacheBuckets,
  snapshotAllBuckets,
  snapshotReservedBuckets,
} from '@kobato/server/infra/cache/buckets'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'

export async function getAdminCacheStats(db: Database): Promise<AdminCacheStatsDto> {
  const [buckets, reserved] = await Promise.all([snapshotAllBuckets(), snapshotReservedBuckets(db)])
  const total = buckets.reduce((sum, bucket) => sum + bucket.keyCount, 0)
  return { buckets, reserved, total, generatedAt: new Date().toISOString() }
}

export async function clearAdminCache(db: Database, target: ClearCacheTarget): Promise<ClearCacheResultDto> {
  if (target === 'all') {
    const removed = await clearAllBuckets()
    const cleared = getCacheBuckets().map((bucket) => ({
      bucketId: bucket.id,
      label: bucket.label,
      removed: removed[bucket.id] ?? 0,
    }))
    const total = cleared.reduce((sum, entry) => sum + entry.removed, 0)
    return { cleared, total, refreshedStats: await getAdminCacheStats(db) }
  }

  const bucket = getBucket(target)
  if (!bucket) {
    throw new DomainError('BAD_REQUEST', descriptorFor('admin.cache.error.unknownGroup', { target }))
  }
  const removed = await clearBucket(bucket)
  return {
    cleared: [{ bucketId: bucket.id, label: bucket.label, removed }],
    total: removed,
    refreshedStats: await getAdminCacheStats(db),
  }
}
