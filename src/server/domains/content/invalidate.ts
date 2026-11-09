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

// Synchronous: called inside entity transactions (comment persist).
export function invalidateContent(event: ContentInvalidationEvent): void {
  switch (event.entity) {
    case 'post':
      clear('feed')
      clear('tags')
      clear('categories')
      clear('sitemap')
      bumpCounter('searchResult')
      return
    case 'page':
      clear('sitemap')
      return
    case 'category':
      clear('categories')
      clear('feed')
      return
    case 'tag':
      clear('tags')
      clear('feed')
      return
    case 'comment':
      clear('comments')
  }
}
