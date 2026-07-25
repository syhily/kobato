import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { createKvCache } from '@/server/infra/cache/kv-cache'
import { getKeys, removeItem } from '@/server/infra/cache/kv-store'

const FEED_CACHE_PREFIX = 'feed:xml:'

export function feedCacheFor(filter: string) {
  return createKvCache<{ rss: string; atom: string }>(`${FEED_CACHE_PREFIX}${filter}`, { ttlMs: 300_000 })
}

export async function clearFeedCache(db: NodePgDatabase): Promise<void> {
  const keys = await getKeys(db, FEED_CACHE_PREFIX)
  await Promise.all(keys.map((key) => removeItem(db, key)))
}
