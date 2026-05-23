import { z } from 'zod'

import type { Assert, Equals } from '@/shared/contracts/primitives'
import type {
  AdminCacheStatsDto,
  CacheBucketStats,
  ClearCacheResultDto,
  ReservedCacheBucketStats,
} from '@/shared/types/cache'

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
  keyCount: z.number().int().nonnegative(),
})

const reservedCacheBucketStatsDto = z.object({
  id: reservedCacheBucketId,
  label: z.string(),
  description: z.string(),
  prefix: z.string(),
  pattern: z.string(),
  keyCount: z.number().int().nonnegative(),
})

export const adminCacheStatsDto = z.object({
  buckets: z.array(cacheBucketStatsDto),
  reserved: z.array(reservedCacheBucketStatsDto),
  total: z.number().int().nonnegative(),
  generatedAt: isoDateTime,
})

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

// ─── parity assertions ─────────────────────────────────
type _cacheBucketStatsParity = Assert<Equals<z.infer<typeof cacheBucketStatsDto>, CacheBucketStats>>
type _reservedCacheBucketStatsParity = Assert<
  Equals<z.infer<typeof reservedCacheBucketStatsDto>, ReservedCacheBucketStats>
>
type _adminCacheStatsParity = Assert<Equals<z.infer<typeof adminCacheStatsDto>, AdminCacheStatsDto>>
type _clearCacheResultParity = Assert<Equals<z.infer<typeof clearCacheResultDto>, ClearCacheResultDto>>
