import type { CacheBucket, CacheBucketId, ReservedCacheBucketId } from '@kobato/cache/types'
import type { CacheBucketStats, ReservedCacheBucketStats } from '@kobato/contracts/cache'
import type { Database } from '@kobato/db/database'

import { CACHE_DECLARATIONS } from '@kobato/cache/registry'
import { CACHE_BUCKET_IDS, RESERVED_CACHE_BUCKETS } from '@kobato/cache/types'
import { session } from '@kobato/db/schema/session'
import { clearBucketDir, clearBucketEntries, statBucket } from '@kobato/server/infra/cache/file-store'
import { bumpCounter, evictBucketMemory, isCounterBucket, resolveCacheSlot } from '@kobato/server/infra/cache/registry'
import { createServerTranslator } from '@kobato/server/infra/i18n'
import { rateLimitEntryCount } from '@kobato/server/infra/rate-limit'
import { resolveAppLocalization } from '@kobato/settings/app-localization'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { count, gt } from 'drizzle-orm'

function cacheTranslator() {
  return createServerTranslator(resolveAppLocalization().locale)
}

export function getCacheBuckets(): CacheBucket[] {
  const t = cacheTranslator()
  return CACHE_DECLARATIONS.map((declaration) => {
    const slot = resolveCacheSlot(declaration.id)
    return {
      id: declaration.id,
      label: t.format(declaration.labelId),
      description: t.format(declaration.descriptionId, { prefix: slot.prefix }),
      prefix: slot.prefix,
      ttlSeconds: slot.ttlSeconds,
      pattern: `${slot.prefix}*`,
    }
  })
}

export function getBucket(id: CacheBucketId): CacheBucket | undefined {
  return getCacheBuckets().find((bucket) => bucket.id === id)
}

export async function clearBucket(bucket: CacheBucket): Promise<number> {
  evictBucketMemory(bucket.id)
  if (isCounterBucket(bucket.id)) {
    const generation = bumpCounter(bucket.id)
    if (generation === null) {
      throw new Error(`cache bucket clear aborted: generation bump failed for '${bucket.id}'`)
    }
    return clearBucketEntries(bucket.id)
  }
  return clearBucketDir(bucket.id)
}

export async function snapshotAllBuckets(): Promise<CacheBucketStats[]> {
  return Promise.all(
    getCacheBuckets().map(async (bucket) => {
      const usage = await statBucket(bucket.id)
      return {
        id: bucket.id,
        label: bucket.label,
        description: bucket.description,
        prefix: bucket.prefix,
        ttlSeconds: bucket.ttlSeconds,
        pattern: bucket.pattern,
        keyCount: usage.keyCount,
        byteSize: usage.byteSize,
      }
    }),
  )
}

async function countReservedBucket(db: Database, id: ReservedCacheBucketId): Promise<number> {
  if (id === 'session') {
    const rows = await db.select({ value: count() }).from(session).where(gt(session.expiresAt, new Date()))
    return rows[0]?.value ?? 0
  }
  return rateLimitEntryCount()
}

export async function snapshotReservedBuckets(db: Database): Promise<ReservedCacheBucketStats[]> {
  const t = cacheTranslator()
  return Promise.all(
    RESERVED_CACHE_BUCKETS.map(async (bucket) => ({
      id: bucket.id,
      label: t.format(bucket.labelId),
      description: t.format(bucket.descriptionId),
      keyCount: await countReservedBucket(db, bucket.id),
    })),
  )
}

export async function clearAllBuckets(): Promise<Record<CacheBucketId, number>> {
  const buckets = getCacheBuckets()
  const entries = await Promise.all(buckets.map(async (bucket) => [bucket.id, await clearBucket(bucket)] as const))
  const result = unsafeCast<Record<CacheBucketId, number>>(Object.fromEntries(CACHE_BUCKET_IDS.map((id) => [id, 0])))
  for (const [id, removed] of entries) {
    result[id] = removed
  }
  return result
}
