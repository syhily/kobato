import { CACHE_BUCKET_IDS } from '@kobato/cache/types.ts'
import { isoDateTime } from '@kobato/contracts/primitives.ts'
import { z } from 'zod'

const cacheBucketId = z.enum(CACHE_BUCKET_IDS)
const reservedCacheBucketId = z.enum(['session', 'rateLimit'])

const cacheBucketStatsDto = z.object({
  id: cacheBucketId,
  label: z.string(),
  description: z.string(),
  prefix: z.string(),
  ttlSeconds: z.number().int().nonnegative(),
  pattern: z.string(),
  /** Live entry count: a valid `KBC1` envelope that is not expired. */
  keyCount: z.number().int().nonnegative(),
  /**
   * On-disk bytes of every entry file in the bucket's shards, envelope
   * included. Expired and malformed entries still occupy disk, so they count
   * here even though `keyCount` excludes them; `_generation`, `_tmp` and trash
   * directories are excluded.
   */
  byteSize: z.number().int().nonnegative(),
})
export type CacheBucketStats = z.infer<typeof cacheBucketStatsDto>

// Reserved buckets have no key prefix — sessions live in the `session` table and
// rate-limit counters are in-process, so only a live count is reported.
const reservedCacheBucketStatsDto = z.object({
  id: reservedCacheBucketId,
  label: z.string(),
  description: z.string(),
  keyCount: z.number().int().nonnegative(),
})
export type ReservedCacheBucketStats = z.infer<typeof reservedCacheBucketStatsDto>

export const adminCacheStatsDto = z.object({
  buckets: z.array(cacheBucketStatsDto),
  reserved: z.array(reservedCacheBucketStatsDto),
  total: z.number().int().nonnegative(),
  generatedAt: isoDateTime,
})
export type AdminCacheStatsDto = z.infer<typeof adminCacheStatsDto>

export const clearCacheResultDto = z.object({
  cleared: z.array(
    z.object({
      bucketId: cacheBucketId,
      label: z.string(),
      removed: z.number().int().nonnegative(),
    }),
  ),
  total: z.number().int().nonnegative(),
  refreshedStats: adminCacheStatsDto,
})
export type ClearCacheResultDto = z.infer<typeof clearCacheResultDto>

// Admin cache wire inputs — the single Zod source the `@kobato/api` cache
// contract composes and the server validates against.

export const adminCacheGetStatsInput = z.object({})
export type AdminCacheGetStatsInput = z.infer<typeof adminCacheGetStatsInput>

export const adminCacheClearInput = z.object({ target: z.union([z.enum(CACHE_BUCKET_IDS), z.literal('all')]) })
export type AdminCacheClearInput = z.infer<typeof adminCacheClearInput>
