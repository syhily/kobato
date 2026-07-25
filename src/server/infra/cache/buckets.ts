import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, count, eq, gt, isNull, or } from 'drizzle-orm'

import type { CacheBucketStats, ReservedCacheBucketStats } from '@/shared/contracts/cache'
import type { CacheBucket, CacheBucketId, ReservedCacheBucketId } from '@/shared/types/cache'

import { kvCache } from '@/server/infra/db/schema/kv-cache'
import { session } from '@/server/infra/db/schema/session'
import { rateLimitEntryCount } from '@/server/infra/rate-limit'
import { getCacheSettings } from '@/shared/config/getters'
import { RESERVED_CACHE_BUCKETS } from '@/shared/types/cache'

// Registry of admin-clearable cache buckets. The bucket ID
// (`og` / `calendar` / `avatar` / …) is hard-coded because every writer in
// the codebase treats it as a stable discriminator — it is also the value
// written into the `kv_cache.bucket` column. The user-facing PREFIX and TTL
// are pulled from the live blog-settings snapshot, so a rename in the admin
// panel takes effect on the next read.
//
// Deliberately excludes:
//  - sessions              clearing them would log every signed-in user out
//                          and break in-flight tokens.
//  - rate-limit counters   clearing them would let a throttled abuser retry
//                          immediately, defeating the spam wall.
// Those two surfaces DO surface read-only in the admin cache page via the
// parallel `RESERVED_CACHE_BUCKETS` registry (see `snapshotReservedBuckets()`).

// Static metadata. The dynamic prefix / TTL / pattern slots are filled
// in by `getCacheBuckets()` from the live snapshot. `as const` keeps
// the ID list typed as the literal tuple so callers can derive Zod
// enums and discriminated unions without losing type information.
const BUCKET_META = [
  {
    id: 'og',
    label: 'OG 图缓存',
    description:
      '/images/og/:slug.png 的渲染结果，键形如 ${prefix}${slug}-${hash}。修改 OG 尺寸或文章封面 / 摘要后清理。',
  },
  {
    id: 'calendar',
    label: '侧边栏日历缓存',
    description: '/images/calendar/:date.png 的渲染结果，键形如 ${prefix}${yyyy-MM-dd}。一天后会自动失效。',
  },
  {
    id: 'avatar',
    label: 'Gravatar 头像缓存',
    description:
      '/images/avatar/:hash.png 缓存的头像字节，键形如 ${prefix}${size}:${hash}（size 为请求 ?s= 参数的尺寸，默认 120）。用户更换头像后清理可让访客立即看到新头像。',
  },
  {
    id: 'imageMeta',
    label: '图片元数据缓存',
    description:
      'SSR 渲染时 storagePath → image 行的查询结果（宽 / 高 / thumbhash），键形如 ${prefix}${storagePath}。在图片库批量上传或导入旧站数据后清理一次即可。',
  },

  {
    id: 'embeddingSearch',
    label: '搜索 Embedding 缓存',
    description:
      '向量搜索时查询文本的 Embedding 结果，键形如 ${prefix}${sha256(text)}。切换 Embedding 模型或维度后应清理一次。',
  },
  {
    id: 'searchResult',
    label: '搜索结果缓存',
    description:
      '搜索查询返回的文章 slug 列表，键形如 ${prefix}${sha256(mode+query+threshold+model)}。分页时直接命中缓存，避免重复查询数据库。',
  },
] as const satisfies readonly {
  id: CacheBucketId
  label: string
  description: string
}[]

/**
 * Build the bucket list from the live blog-settings snapshot. Reading
 * fresh on every call is intentional — it costs nothing (in-process
 * `Map` lookup) and ensures admin renames are immediately visible to
 * `getAdminCacheStats()` / `clearAdminCache()`.
 */
export function getCacheBuckets(): CacheBucket[] {
  const cache = getCacheSettings().cache
  return BUCKET_META.map((meta) => {
    const slot = cache[meta.id]
    return {
      id: meta.id,
      label: meta.label,
      description: meta.description,
      prefix: slot.prefix,
      ttlSeconds: slot.ttlSeconds,
      pattern: `${slot.prefix}*`,
    }
  })
}

export function getBucket(id: CacheBucketId): CacheBucket | undefined {
  return getCacheBuckets().find((bucket) => bucket.id === id)
}

// Counts filter expired rows the same way kv-store reads do — the admin
// panel reports what the cache would actually serve, not what the hourly
// sweep hasn't reclaimed yet.
function liveEntries() {
  return or(isNull(kvCache.expiresAt), gt(kvCache.expiresAt, new Date()))
}

/** Count live `kv_cache` rows carrying the bucket label. */
export async function countBucket(db: NodePgDatabase, bucket: CacheBucket): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(kvCache)
    .where(and(eq(kvCache.bucket, bucket.id), liveEntries()))
  return rows[0]?.value ?? 0
}

/** Delete every `kv_cache` row carrying the bucket label; returns the number removed. */
export async function clearBucket(db: NodePgDatabase, bucket: CacheBucket): Promise<number> {
  const result = await db.delete(kvCache).where(eq(kvCache.bucket, bucket.id))
  return result.rowCount ?? 0
}

/** Aggregate counts across every registered bucket. */
export async function snapshotAllBuckets(db: NodePgDatabase): Promise<CacheBucketStats[]> {
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

async function countReservedBucket(db: NodePgDatabase, id: ReservedCacheBucketId): Promise<number> {
  if (id === 'session') {
    const rows = await db.select({ value: count() }).from(session).where(gt(session.expiresAt, new Date()))
    return rows[0]?.value ?? 0
  }
  return rateLimitEntryCount()
}

/**
 * Count the read-only reserved buckets (live `session` rows, in-process
 * rate-limit windows). Returned alongside the editable bucket stats so
 * the admin cache page can surface them for visibility without exposing
 * a clear button.
 */
export async function snapshotReservedBuckets(db: NodePgDatabase): Promise<ReservedCacheBucketStats[]> {
  return Promise.all(
    RESERVED_CACHE_BUCKETS.map(async (bucket) => ({
      id: bucket.id,
      label: bucket.label,
      description: bucket.description,
      prefix: bucket.prefix,
      pattern: bucket.pattern,
      keyCount: await countReservedBucket(db, bucket.id),
    })),
  )
}

/** Clear every registered bucket; returns the per-bucket removed counts. */
export async function clearAllBuckets(db: NodePgDatabase): Promise<Record<CacheBucketId, number>> {
  const buckets = getCacheBuckets()
  const entries = await Promise.all(buckets.map(async (bucket) => [bucket.id, await clearBucket(db, bucket)] as const))
  const result: Record<CacheBucketId, number> = {
    avatar: 0,
    calendar: 0,
    embeddingSearch: 0,
    imageMeta: 0,
    og: 0,
    searchResult: 0,
  }
  for (const [id, count] of entries) {
    result[id] = count
  }
  return result
}
