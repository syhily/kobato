import { isoDateTime } from '@kobato/api/contracts/primitives'
import { CACHE_BUCKET_IDS } from '@kobato/settings/cache-bucket'
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
  keyCount: z.number().int().nonnegative(),
  byteSize: z.number().int().nonnegative(),
})
export type CacheBucketStats = z.infer<typeof cacheBucketStatsDto>

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

export const adminCacheGetStatsInput = z.object({})
export type AdminCacheGetStatsInput = z.infer<typeof adminCacheGetStatsInput>

export const adminCacheClearInput = z.object({ target: z.union([z.enum(CACHE_BUCKET_IDS), z.literal('all')]) })
export type AdminCacheClearInput = z.infer<typeof adminCacheClearInput>
