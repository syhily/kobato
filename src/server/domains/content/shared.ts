import { clearPagesCache } from '@/server/domains/pages/services/shared'
import { clearPostMetasCache } from '@/server/domains/posts/services/shared'
import { clearFeedCache } from '@/server/infra/cache/feed-cache'
import { clearSitemapCache } from '@/server/infra/cache/sitemap-cache'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('content.cache')

export type ContentEntityType = 'post' | 'page'

export async function clearContentCaches(entityType: ContentEntityType, entityId?: bigint): Promise<void> {
  if (entityType === 'post') {
    await clearPostMetasCache()
    await clearFeedCache().catch((err: unknown) => {
      log.warn('clear feed cache failed', { entityId: entityId?.toString(), error: err })
    })
  } else {
    await clearPagesCache()
  }
  await clearSitemapCache().catch((err: unknown) => {
    log.warn('clear sitemap cache failed', { entityId: entityId?.toString(), error: err })
  })
}
