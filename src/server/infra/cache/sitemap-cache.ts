import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { createKvCache } from '@/server/infra/cache/kv-cache'
import { removeItem } from '@/server/infra/cache/kv-store'

const SITEMAP_CACHE_KEY = 'sitemap:xml'

export const sitemapCache = createKvCache<string>(SITEMAP_CACHE_KEY, { ttlMs: 300_000 })

export async function clearSitemapCache(db: NodePgDatabase): Promise<void> {
  await removeItem(db, SITEMAP_CACHE_KEY)
}
