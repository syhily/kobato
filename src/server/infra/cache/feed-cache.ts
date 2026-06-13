import { createRedisCache } from '@/server/infra/cache/redis-cache'
import { storage } from '@/server/infra/redis/storage'

const FEED_CACHE_PREFIX = 'feed:xml:'

export function feedCacheFor(filter: string) {
  return createRedisCache<{ rss: string; atom: string }>(`${FEED_CACHE_PREFIX}${filter}`, { ttlMs: 300_000 })
}

export async function clearFeedCache(): Promise<void> {
  const keys = await storage.getKeys(FEED_CACHE_PREFIX)
  await Promise.all(keys.map((key) => storage.removeItem(key)))
}
