// Comment-domain cache layer.
//
// Currently caches the global "latest comments" sidebar list.
// Per-page comment-thread caching is left for future profiling.

import type { LatestComment } from '@/shared/types/comments'

import { createRedisCache } from '@/server/infra/cache/redis-cache'

export const latestCommentsCache = createRedisCache<LatestComment[]>('comments:latest', {
  ttlMs: 30_000,
})

export async function clearLatestCommentsCache(): Promise<void> {
  await latestCommentsCache.clear()
}
