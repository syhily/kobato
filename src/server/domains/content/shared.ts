import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { clear } from '@/server/infra/cache/registry'

export type ContentEntityType = 'post' | 'page'

// Every clear is best-effort (the cache module logs and swallows
// failures), so a cache outage can never bring down a content mutation.
// `entityId` stays in the signature for caller compatibility.
export async function clearContentCaches(
  db: NodePgDatabase,
  entityType: ContentEntityType,
  _entityId?: bigint,
): Promise<void> {
  if (entityType === 'post') {
    await clear(db, 'feed')
    await clear(db, 'tags')
    await clear(db, 'categories')
  }
  await clear(db, 'sitemap')
}
