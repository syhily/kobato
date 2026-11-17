import type { Database } from '@kobato/db/database.ts'
import type { PostMetaRow } from '@kobato/db/types.ts'
import type { ListPublicPostsFilters } from '@kobato/server/domains/posts/repos/shared.ts'
import type { Post, PostVisibilityOptions } from '@kobato/shared/types/catalog.ts'

import { findCategoryNamesByIds } from '@kobato/db/operations/category.ts'
import { findTagNamesByPostIds } from '@kobato/db/operations/post-tag.ts'
import { hydratePublishedRevisions } from '@kobato/server/domains/content/revisions.ts'
import { hydrateImageRefs } from '@kobato/server/domains/images/services/enhance.ts'
import { toCmsPost } from '@kobato/server/domains/posts/projection.ts'

/**
 * Resolves `cover` to its CDN public URL and attaches `coverThumbhash`
 * for any post-shaped projection carrying both fields.
 */
export async function hydratePostImages(
  db: Database,
  posts: { cover: string; coverThumbhash?: string }[],
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
  /** `'none'` (default): empty body, for cards/metadata listings.
   *  `'published'`: join published revisions for real bodies + headings. */
  revision?: 'none' | 'published'
  /** Resolve covers to CDN public URLs + thumbhashes. Default `true`. */
  images?: boolean
}

/**
 * The public post-list assembly pipeline — mount this instead of
 * hand-assembling a new copy.
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
