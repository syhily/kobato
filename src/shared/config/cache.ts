import type { BlogSettingsBundle } from '@/shared/config/types'

import { CACHE_DECLARATIONS } from '@/shared/cache/registry'
import { type CacheBucketSlot, type TunableCacheBucketId } from '@/shared/types/cache'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

type CacheSettingsNonNull = NonNullable<BlogSettingsBundle['cache']>

function isCacheBucketSlotLike(value: unknown): value is CacheBucketSlot {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { prefix?: unknown }).prefix === 'string' &&
    typeof (value as { ttlSeconds?: unknown }).ttlSeconds === 'number'
  )
}

// Merge the stored cache section over the declared fallbacks, one tunable
// bucket at a time — the slot list derives from the declaration registry,
// so a malformed or missing slot falls back to its declaration, never to
// a hand-maintained copy.
export function withCacheFallbacks(value: CacheSettingsNonNull): CacheSettingsNonNull {
  // The stored row is partial by nature — a slot written before its
  // bucket existed (or hand-edited away) falls back to its declaration.
  const stored = unsafeCast<Partial<Record<TunableCacheBucketId, unknown>>>(value.cache)
  const entries: [TunableCacheBucketId, CacheBucketSlot][] = []
  for (const entry of CACHE_DECLARATIONS) {
    if (!entry.tunable) {
      continue
    }
    const slot = stored[entry.id]
    entries.push([
      entry.id,
      isCacheBucketSlotLike(slot) ? slot : { prefix: entry.defaultPrefix, ttlSeconds: entry.defaultTtlSeconds },
    ])
  }
  // The loop covers every tunable id; the literal-keyed Record just
  // can't be proven complete from a runtime iteration.
  return { ...value, cache: unsafeCast<Record<TunableCacheBucketId, CacheBucketSlot>>(Object.fromEntries(entries)) }
}
