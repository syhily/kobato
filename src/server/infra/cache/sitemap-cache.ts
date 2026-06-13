import { createRedisCache } from '@/server/infra/cache/redis-cache'
import { storage } from '@/server/infra/redis/storage'

const SITEMAP_CACHE_KEY = 'sitemap:xml'

export const sitemapCache = createRedisCache<string>(SITEMAP_CACHE_KEY, { ttlMs: 300_000 })

export async function clearSitemapCache(): Promise<void> {
  await storage.removeItem(SITEMAP_CACHE_KEY)
}
