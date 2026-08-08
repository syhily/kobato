import { and, count, eq, gt, isNull, or } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { CacheBucketStats, ReservedCacheBucketStats } from '@/shared/contracts/cache'
import type { CacheBucket, CacheBucketId, ReservedCacheBucketId } from '@/shared/types/cache'

import { resolveCacheSlot } from '@/server/infra/cache/registry'
import { kvCache } from '@/server/infra/db/schema/kv-cache'
import { session } from '@/server/infra/db/schema/session'
import { rateLimitEntryCount } from '@/server/infra/rate-limit'
import { CACHE_DECLARATIONS } from '@/shared/cache/registry'
import { CACHE_BUCKET_IDS, RESERVED_CACHE_BUCKETS } from '@/shared/types/cache'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// Admin view over the shared cache declarations; bucket IDs double as the
// `kv_cache.bucket` column value. Sessions and rate-limit counters are
// deliberately excluded — they surface read-only via `RESERVED_CACHE_BUCKETS`.

export function getCacheBuckets(): CacheBucket[] {
  return CACHE_DECLARATIONS.map((declaration) => {
    const slot = resolveCacheSlot(declaration.id)
    return {
      id: declaration.id,
      label: declaration.label,
      description: declaration.description(slot.prefix),
      prefix: slot.prefix,
      ttlSeconds: slot.ttlSeconds,
      pattern: `${slot.prefix}*`,
    }
  })
}

export function getBucket(id: CacheBucketId): CacheBucket | undefined {
  return getCacheBuckets().find((bucket) => bucket.id === id)
}

// Filter expired rows like kv-store reads — report what the cache would actually serve.
function liveEntries() {
  return or(isNull(kvCache.expiresAt), gt(kvCache.expiresAt, new Date()))
}

export async function countBucket(db: Database, bucket: CacheBucket): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(kvCache)
    .where(and(eq(kvCache.bucket, bucket.id), liveEntries()))
  return rows[0]?.value ?? 0
}

export async function clearBucket(db: Database, bucket: CacheBucket): Promise<number> {
  const result = await db.delete(kvCache).where(eq(kvCache.bucket, bucket.id))
  return Number(result.changes)
}

export async function snapshotAllBuckets(db: Database): Promise<CacheBucketStats[]> {
  return Promise.all(
    getCacheBuckets().map(async (bucket) => ({
      id: bucket.id,
      label: bucket.label,
      description: bucket.description,
      prefix: bucket.prefix,
      ttlSeconds: bucket.ttlSeconds,
      pattern: bucket.pattern,
      keyCount: await countBucket(db, bucket),
    })),
  )
}

async function countReservedBucket(db: Database, id: ReservedCacheBucketId): Promise<number> {
  if (id === 'session') {
    const rows = await db.select({ value: count() }).from(session).where(gt(session.expiresAt, new Date()))
    return rows[0]?.value ?? 0
  }
  return rateLimitEntryCount()
}

/** Count the read-only reserved buckets (live sessions, rate-limit windows) — visibility without a clear button. */
export async function snapshotReservedBuckets(db: Database): Promise<ReservedCacheBucketStats[]> {
  return Promise.all(
    RESERVED_CACHE_BUCKETS.map(async (bucket) => ({
      id: bucket.id,
      label: bucket.label,
      description: bucket.description,
      keyCount: await countReservedBucket(db, bucket.id),
    })),
  )
}

export async function clearAllBuckets(db: Database): Promise<Record<CacheBucketId, number>> {
  const buckets = getCacheBuckets()
  const entries = await Promise.all(buckets.map(async (bucket) => [bucket.id, await clearBucket(db, bucket)] as const))
  // CACHE_BUCKET_IDS covers every bucket id; the Record just can't be proven from a runtime map.
  const result = unsafeCast<Record<CacheBucketId, number>>(Object.fromEntries(CACHE_BUCKET_IDS.map((id) => [id, 0])))
  for (const [id, removed] of entries) {
    result[id] = removed
  }
  return result
}
