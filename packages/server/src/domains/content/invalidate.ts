import type { Database } from '@kobato/server/infra/db/database'

import { bumpCounter, clear } from '@kobato/server/infra/cache/registry'

/**
 * The single content-invalidation door. A mutation that changes what a
 * public surface shows emits one coarse event here instead of touching
 * cache buckets directly; this module owns the complete event → side
 * effect mapping. Best-effort — the cache verbs already log and swallow
 * failures, so call sites never try/catch.
 *
 * Mapping notes:
 * - post: feed XML, taxonomy lists, and the sitemap embed post data,
 *   and the search corpus changes with the post set → bump `searchResult`.
 * - page: only the sitemap lists pages; pages are outside the search corpus.
 * - category/tag: taxonomy list bucket AND the whole feed bucket — feed
 *   entries are keyed by taxonomy slug, so a rename would otherwise serve
 *   stale XML until the feed TTL.
 * - comment: the sidebar latest-comments list.
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
