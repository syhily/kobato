// Comment-domain cache layer.
//
// Currently caches the global "latest comments" sidebar list.
// Per-page comment-thread caching is left for future profiling.

import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { LatestComment } from '@/shared/types/comments'

import { createKvCache } from '@/server/infra/cache/kv-cache'

export const latestCommentsCache = createKvCache<LatestComment[]>('comments:latest', {
  ttlMs: 30_000,
})

export async function clearLatestCommentsCache(db: NodePgDatabase): Promise<void> {
  await latestCommentsCache.clear(db)
}
