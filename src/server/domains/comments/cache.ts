// Comment-domain cache layer.
//
// Currently caches the global "latest comments" sidebar list.
// Per-page comment-thread caching is left for future profiling.

import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { clear } from '@/server/infra/cache/registry'

export async function clearLatestCommentsCache(db: NodePgDatabase): Promise<void> {
  await clear(db, 'comments')
}
