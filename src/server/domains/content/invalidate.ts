import type { Database } from '@/server/infra/db/database'

import { bumpCounter, clear } from '@/server/infra/cache/registry'

/**
 * The single content-invalidation door: mutations emit one coarse event,
 * mapped to cache buckets here. Best-effort — call sites never try/catch.
 */
export type ContentInvalidationEvent =
  | { entity: 'post' }
  | { entity: 'page' }
  | { entity: 'category' }
  | { entity: 'tag' }
  | { entity: 'comment' }

// Sync (node:sqlite): called inside entity transactions (comment persist).
export function invalidateContent(db: Database, event: ContentInvalidationEvent): void {
  switch (event.entity) {
    case 'post':
      clear(db, 'feed')
      clear(db, 'tags')
      clear(db, 'categories')
      clear(db, 'sitemap')
      bumpCounter(db, 'searchResult')
      return
    case 'page':
      clear(db, 'sitemap')
      return
    case 'category':
      clear(db, 'categories')
      clear(db, 'feed')
      return
    case 'tag':
      clear(db, 'tags')
      clear(db, 'feed')
      return
    case 'comment':
      clear(db, 'comments')
      return
  }
}
