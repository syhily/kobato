import { bumpCounter, clear } from '@/server/infra/cache/registry'

/**
 * The single content-invalidation door: mutations emit one coarse event,
 * mapped to cache buckets here. Best-effort — call sites never try/catch.
 * The taxonomy/comments sidebar digests read SQLite directly (no bucket),
 * so comment mutations have nothing to invalidate.
 */
export type ContentInvalidationEvent =
  | { entity: 'post' }
  | { entity: 'page' }
  | { entity: 'category' }
  | { entity: 'tag' }

// Synchronous: called inside entity transactions.
export function invalidateContent(event: ContentInvalidationEvent): void {
  switch (event.entity) {
    case 'post':
      clear('feed')
      clear('sitemap')
      bumpCounter('searchResult')
      return
    case 'page':
      clear('sitemap')
      return
    case 'category':
      clear('feed')
      return
    case 'tag':
      clear('feed')
  }
}
