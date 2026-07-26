import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { bumpCounter, clear } from '@/server/infra/cache/registry'

/**
 * The single content-invalidation door. A mutation that changes what a
 * public surface shows emits one coarse event here instead of touching
 * cache buckets directly; this module owns the complete event → side
 * effect mapping. Best-effort by construction — the cache verbs already
 * log and swallow failures, so call sites never try/catch.
 *
 * Mapping notes:
 * - post: feed XML, the taxonomy lists, and the sitemap all embed post
 *   data, and the search corpus (title + summary + plainText) changes
 *   with the post set → bump the `searchResult` generation.
 * - page: only the sitemap lists pages; pages are outside the search
 *   corpus, so the generation stays.
 * - category/tag: the taxonomy list bucket AND the whole feed bucket —
 *   feed entries are keyed by taxonomy slug (`feed:xml:cat:<slug>`), so
 *   a rename would otherwise serve stale XML until the feed TTL. The
 *   search corpus contains no taxonomy names, so no generation bump.
 * - comment: the sidebar latest-comments list.
 */
export type ContentInvalidationEvent =
  | { entity: 'post' }
  | { entity: 'page' }
  | { entity: 'category' }
  | { entity: 'tag' }
  | { entity: 'comment' }

export async function invalidateContent(db: NodePgDatabase, event: ContentInvalidationEvent): Promise<void> {
  switch (event.entity) {
    case 'post':
      await clear(db, 'feed')
      await clear(db, 'tags')
      await clear(db, 'categories')
      await clear(db, 'sitemap')
      await bumpCounter(db, 'searchResult')
      return
    case 'page':
      await clear(db, 'sitemap')
      return
    case 'category':
      await clear(db, 'categories')
      await clear(db, 'feed')
      return
    case 'tag':
      await clear(db, 'tags')
      await clear(db, 'feed')
      return
    case 'comment':
      await clear(db, 'comments')
      return
  }
}
