import type { Database } from '@/server/infra/db/database'
import type { AdminCacheStatsDto, ClearCacheResultDto } from '@/shared/contracts/cache'
import type { ClearCacheTarget } from '@/shared/types/cache'

import {
  clearAllBuckets,
  clearBucket,
  getBucket,
  getCacheBuckets,
  snapshotAllBuckets,
  snapshotReservedBuckets,
} from '@/server/infra/cache/buckets'
import { DomainError } from '@/server/infra/http/errors'

export async function getAdminCacheStats(db: Database): Promise<AdminCacheStatsDto> {
  const [buckets, reserved] = await Promise.all([snapshotAllBuckets(db), snapshotReservedBuckets(db)])
  const total = buckets.reduce((sum, bucket) => sum + bucket.keyCount, 0)
  return { buckets, reserved, total, generatedAt: new Date().toISOString() }
}

export async function clearAdminCache(db: Database, target: ClearCacheTarget): Promise<ClearCacheResultDto> {
  if (target === 'all') {
    const removed = await clearAllBuckets(db)
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
    // Belt-and-braces guard for callers that bypass the API-surface Zod schema.
    throw new DomainError('BAD_REQUEST', `未知的缓存分组：${target}`)
  }
  const removed = await clearBucket(db, bucket)
  return {
    cleared: [{ bucketId: bucket.id, label: bucket.label, removed }],
    total: removed,
    refreshedStats: await getAdminCacheStats(db),
  }
}
