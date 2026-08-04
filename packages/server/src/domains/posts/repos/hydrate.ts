import type { ListPublicPostsFilters } from '@kobato/server/domains/posts/repos/shared'
import type { Database } from '@kobato/server/infra/db/database'
import type { PostMetaRow } from '@kobato/server/infra/db/types'
import type { Post, PostVisibilityOptions } from '@kobato/shared/types/catalog'

import { hydratePublishedRevisions } from '@kobato/server/domains/content/revisions'
import { hydrateImageRefs } from '@kobato/server/domains/images/services/enhance'
import { toCmsPost } from '@kobato/server/domains/posts/projection'
import { findCategoryNamesByIds } from '@kobato/server/infra/db/operations/category'
import { findTagNamesByPostIds } from '@kobato/server/infra/db/operations/post-tag'

/**
 * Cover hydration for any post-shaped projection carrying `cover` /
 * `coverThumbhash` (`Post`, `ClientPost`, `ListingPostCard`, ...): resolves
 * the stored cover to its CDN public URL and attaches the thumbhash.
 */
export async function hydratePostImages<T extends { cover: string; coverThumbhash?: string }>(
  db: Database,
  posts: T[],
): Promise<void> {
  await hydrateImageRefs(
    db,
    posts,
    (p) => p.cover,
    (p, lookup) => {
      p.coverThumbhash = lookup?.thumbhash
      if (lookup?.publicUrl != null) {
        p.cover = lookup.publicUrl
      }
    },
  )
}

export function buildPublicPostFilters(
  options?: PostVisibilityOptions,
): Omit<ListPublicPostsFilters, 'sortBy' | 'limit' | 'offset'> {
  return {
    includeHidden: options?.includeHidden ?? false,
    includeScheduled: options?.includeScheduled ?? false,
  }
}

export interface HydratePostListOptions {
  /**
   * `'none'` (default): project metas with an empty body — cheap, for cards
   * and metadata-only listings. `'published'`: batch-join the published
   * `content` revisions so posts carry real Portable Text bodies + headings
   * (feeds and other body-rendering callers).
   */
  revision?: 'none' | 'published'
  /** Resolve covers to CDN public URLs + thumbhashes. Default `true`. */
  images?: boolean
}

/**
 * The public post-list assembly pipeline: batch tag + category names,
 * project each meta to a full `Post`, optionally join published revisions,
 * optionally hydrate covers. Every public listing (cards, archives,
 * taxonomy, feed, search hydration) is a one-liner over this — mount it
 * instead of hand-assembling a new copy.
 */
export async function hydratePostList(
  db: Database,
  metas: PostMetaRow[],
  options: HydratePostListOptions = {},
): Promise<Post[]> {
  if (metas.length === 0) {
    return []
  }
  const revisions = options.revision === 'published' ? await hydratePublishedRevisions(db, metas) : null
  const tagMap = await findTagNamesByPostIds(
    db,
    metas.map((m) => m.id),
  )
  const categoryMap = await findCategoryNamesByIds(
    db,
    metas.map((m) => m.categoryId).filter((id): id is number => id !== null),
  )
  const posts = metas.map((meta) => {
    const revision =
      revisions === null || meta.publishedRevisionId === null ? null : (revisions.get(meta.publishedRevisionId) ?? null)
    return toCmsPost(meta, revision, {
      tags: tagMap.get(meta.id) ?? [],
      categoryName: categoryMap.get(meta.categoryId ?? -1) ?? '',
    })
  })
  if (options.images !== false) {
    await hydratePostImages(db, posts)
  }
  return posts
}
