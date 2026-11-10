import { count, gt } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { CacheBucketStats, ReservedCacheBucketStats } from '@/shared/contracts/cache'
import type { CacheBucket, CacheBucketId, ReservedCacheBucketId } from '@/shared/types/cache'

import { clearBucketDir, clearBucketEntries, statBucket } from '@/server/infra/cache/file-store'
import { bumpCounter, evictBucketMemory, isCounterBucket, resolveCacheSlot } from '@/server/infra/cache/registry'
import { session } from '@/server/infra/db/schema/session'
import { createServerTranslator } from '@/server/infra/i18n'
import { rateLimitEntryCount } from '@/server/infra/rate-limit'
import { CACHE_DECLARATIONS } from '@/shared/cache/registry'
import { resolveAppLocalization } from '@/shared/i18n/app-localization'
import { CACHE_BUCKET_IDS, RESERVED_CACHE_BUCKETS } from '@/shared/types/cache'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// Admin view over the shared cache declarations; bucket IDs are the stable
// directory names under `<storage.data>/cache`. Sessions and rate-limit
// counters are reserved (read-only via `RESERVED_CACHE_BUCKETS`). The registry
// stores message ids, so labels are translated here, not shipped across the wire.

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

/**
 * Async admin clear. The process-local L1 tier drops synchronously FIRST — a
 * served request must never see a value the admin just cleared. A counter
 * bucket then bumps its persisted generation strictly (a failed bump aborts)
 * before dropping entry shards, so a late write holding the pre-clear
 * generation lands in a recreated shard no reader will address.
 * Non-counter buckets rm the whole directory.
 */
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

/** Count the read-only reserved buckets (live sessions, rate-limit windows) — visibility without a clear button. */
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
  // CACHE_BUCKET_IDS covers every bucket id; the Record just can't be proven from a runtime map.
  const result = unsafeCast<Record<CacheBucketId, number>>(Object.fromEntries(CACHE_BUCKET_IDS.map((id) => [id, 0])))
  for (const [id, removed] of entries) {
    result[id] = removed
  }
  return result
}
