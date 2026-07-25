import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { categoriesCache } from '@/server/domains/taxonomies/categories/services/query'
import { clearTagCache } from '@/server/domains/taxonomies/tags/service'
import { clearFeedCache } from '@/server/infra/cache/feed-cache'
import { clearSitemapCache } from '@/server/infra/cache/sitemap-cache'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('content.cache')

export type ContentEntityType = 'post' | 'page'

export async function clearContentCaches(
  db: NodePgDatabase,
  entityType: ContentEntityType,
  entityId?: bigint,
): Promise<void> {
  if (entityType === 'post') {
    await clearFeedCache(db).catch((err: unknown) => {
      log.warn('clear feed cache failed', { entityId: entityId?.toString(), error: err })
    })
    await clearTagCache(db).catch((err: unknown) => {
      log.warn('clear tag cache failed', { entityId: entityId?.toString(), error: err })
    })
    await categoriesCache.clear(db).catch((err: unknown) => {
      log.warn('clear category cache failed', { entityId: entityId?.toString(), error: err })
    })
  }
  await clearSitemapCache(db).catch((err: unknown) => {
    log.warn('clear sitemap cache failed', { entityId: entityId?.toString(), error: err })
  })
}
