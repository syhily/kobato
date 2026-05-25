import type { BlogSettingsBundle } from '@/shared/config/types'

import { CACHE_BUCKET_FALLBACKS, type CacheBucketSlot } from '@/shared/types/cache'

type CacheSettingsNonNull = NonNullable<BlogSettingsBundle['cache']>
type CacheBucketKey = keyof CacheSettingsNonNull['cache']

function isCacheBucketSlotLike(value: unknown): value is CacheBucketSlot {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { prefix?: unknown }).prefix === 'string' &&
    typeof (value as { ttlSeconds?: unknown }).ttlSeconds === 'number'
  )
}

export function withCacheFallbacks(value: CacheSettingsNonNull): CacheSettingsNonNull {
  const cache = value.cache as Partial<CacheSettingsNonNull['cache']>
  const fallback = CACHE_BUCKET_FALLBACKS as Record<CacheBucketKey, CacheBucketSlot>
  return {
    ...value,
    cache: {
      og: isCacheBucketSlotLike(cache.og) ? cache.og : fallback.og,
      calendar: isCacheBucketSlotLike(cache.calendar) ? cache.calendar : fallback.calendar,
      avatar: isCacheBucketSlotLike(cache.avatar) ? cache.avatar : fallback.avatar,
      imageMeta: isCacheBucketSlotLike(cache.imageMeta) ? cache.imageMeta : fallback.imageMeta,
      embeddingSearch: isCacheBucketSlotLike(cache.embeddingSearch) ? cache.embeddingSearch : fallback.embeddingSearch,
      searchResult: isCacheBucketSlotLike(cache.searchResult) ? cache.searchResult : fallback.searchResult,
    },
  }
}
