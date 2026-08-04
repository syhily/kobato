// Derived cache-bucket views. The declaration table itself lives in
// `@kobato/shared/cache/registry` — this module derives the id unions, the
// tunable fallbacks, and the reserved (read-only) bucket metadata from
// it, so no second hand-synced enumeration exists.

import { CACHE_DECLARATIONS } from '@kobato/shared/cache/registry'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'

export type CacheBucketId = (typeof CACHE_DECLARATIONS)[number]['id']

// Non-empty tuple so `z.enum` accepts it directly; the declaration
// table guarantees at least one entry, so the cast is sound.
export const CACHE_BUCKET_IDS = unsafeCast<readonly [CacheBucketId, ...CacheBucketId[]]>(
  CACHE_DECLARATIONS.map((entry) => entry.id),
)

export type TunableCacheBucketId = (typeof CACHE_DECLARATIONS)[number] extends infer Entry
  ? Entry extends { readonly tunable: true; readonly id: infer Id }
    ? Id
    : never
  : never

const tunableIds: TunableCacheBucketId[] = []
for (const entry of CACHE_DECLARATIONS) {
  if (entry.tunable) {
    tunableIds.push(entry.id)
  }
}

export const TUNABLE_CACHE_BUCKET_IDS: readonly TunableCacheBucketId[] = tunableIds

const TUNABLE_ID_SET: ReadonlySet<string> = new Set(TUNABLE_CACHE_BUCKET_IDS)

export function isTunableCacheBucket(id: CacheBucketId): id is TunableCacheBucketId {
  return TUNABLE_ID_SET.has(id)
}

export interface CacheBucketSlot {
  prefix: string
  ttlSeconds: number
}

/** Declared prefix + TTL per tunable bucket — the pre-hydration fallback. */
// Every tunable id is written by the loop below; the literal-keyed
// Record just can't be proven complete from a runtime filter.
export const CACHE_BUCKET_FALLBACKS = unsafeCast<Record<TunableCacheBucketId, CacheBucketSlot>>(
  Object.fromEntries(
    CACHE_DECLARATIONS.filter((entry) => entry.tunable).map((entry) => [
      entry.id,
      { prefix: entry.defaultPrefix, ttlSeconds: entry.defaultTtlSeconds },
    ]),
  ),
)

// Read-only cache surfaces that the admin panel surfaces for visibility
// only — no rename, no clear. Both are critical to runtime behaviour:
// clearing sessions would log everyone out and break in-flight tokens;
// clearing rate-limit counters would let throttled abusers retry
// immediately. Sessions live in the `session` table and rate-limit
// counters are in-process, so operating on them stays
// administrative-tool territory (SQL shells / process restarts).
export type ReservedCacheBucketId = 'session' | 'rateLimit'

export interface ReservedCacheBucket {
  id: ReservedCacheBucketId
  label: string
  description: string
}

export const RESERVED_CACHE_BUCKETS: readonly ReservedCacheBucket[] = [
  {
    id: 'session',
    label: '登录会话',
    description:
      'Cookie 解析后命中的服务端会话记录，存储于数据库 session 表（行主键即 sid）。承载所有已登录设备的服务端会话；为防止误清空导致全员登出，仅供查看。',
  },
  {
    id: 'rateLimit',
    label: '限流计数器',
    description:
      '登录 / 评论 / 点赞 / 邀请等通道的速率限制窗口计数，保存在进程内存中（进程重启即清零）。清空会让被节流的滥用者立刻可以重试，仅供查看。',
  },
]

export interface CacheBucket {
  id: CacheBucketId
  label: string
  description: string
  prefix: string
  ttlSeconds: number
  pattern: string
}

export type ClearCacheTarget = CacheBucketId | 'all'

export interface ClearCacheInput {
  target: ClearCacheTarget
}
