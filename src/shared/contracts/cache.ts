import { z } from 'zod'

import { isoDateTime } from '@/shared/contracts/primitives'

const cacheBucketId = z.enum(['og', 'calendar', 'avatar', 'imageMeta', 'embeddingSearch', 'searchResult'])
const reservedCacheBucketId = z.enum(['session', 'rateLimit'])

const cacheBucketStatsDto = z.object({
  id: cacheBucketId,
  label: z.string(),
  description: z.string(),
  prefix: z.string(),
  ttlSeconds: z.number().int().nonnegative(),
  pattern: z.string(),
  /** Live row count for the bucket (expired rows excluded). */
  keyCount: z.number().int().nonnegative(),
})
export type CacheBucketStats = z.infer<typeof cacheBucketStatsDto>

const reservedCacheBucketStatsDto = z.object({
  id: reservedCacheBucketId,
  label: z.string(),
  description: z.string(),
  prefix: z.string(),
  pattern: z.string(),
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
