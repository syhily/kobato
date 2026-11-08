// Derived cache-bucket views: the id unions, the tunable fallbacks, and
// the reserved (read-only) bucket metadata all derive from
// `@/shared/cache/registry` — no second hand-synced enumeration exists.

import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { CACHE_DECLARATIONS } from '@/shared/cache/registry'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

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

// Read-only surfaces (no rename, no clear): clearing sessions logs
// everyone out; clearing rate-limit counters unblocks throttled
// abusers. Both live outside `kv_cache` (DB table / process memory).
export type ReservedCacheBucketId = 'session' | 'rateLimit'

export interface ReservedCacheBucket {
  id: ReservedCacheBucketId
  /** Label message id — resolved by the admin surface's translator. */
  labelId: UiMessageId
  /** Description message id. */
  descriptionId: UiMessageId
}

export const RESERVED_CACHE_BUCKETS: readonly ReservedCacheBucket[] = [
  {
    id: 'session',
    labelId: 'admin.cache.reserved.session.label',
    descriptionId: 'admin.cache.reserved.session.description',
  },
  {
    id: 'rateLimit',
    labelId: 'admin.cache.reserved.rateLimit.label',
    descriptionId: 'admin.cache.reserved.rateLimit.description',
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
