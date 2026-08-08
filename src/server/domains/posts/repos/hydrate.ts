import type { ListPublicPostsFilters } from '@/server/domains/posts/repos/shared'
import type { Database } from '@/server/infra/db/database'
import type { PostMetaRow } from '@/server/infra/db/types'
import type { Post, PostVisibilityOptions } from '@/shared/types/catalog'

import { hydratePublishedRevisions } from '@/server/domains/content/revisions'
import { hydrateImageRefs } from '@/server/domains/images/services/enhance'
import { toCmsPost } from '@/server/domains/posts/projection'
import { findCategoryNamesByIds } from '@/server/infra/db/operations/category'
import { findTagNamesByPostIds } from '@/server/infra/db/operations/post-tag'

/**
 * Resolves `cover` to its CDN public URL and attaches `coverThumbhash`
 * for any post-shaped projection carrying both fields.
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
