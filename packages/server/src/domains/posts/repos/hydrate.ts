import type { Post, PostVisibilityOptions } from '@kobato/catalog/model'
import type { Database } from '@kobato/db/database'
import type { PostMetaRow } from '@kobato/db/types'
import type { ListPublicPostsFilters } from '@kobato/server/domains/posts/repos/shared'

import { findCategoryNamesByIds } from '@kobato/db/operations/category'
import { findTagNamesByPostIds } from '@kobato/db/operations/post-tag'
import { hydratePublishedRevisions } from '@kobato/server/domains/content/revisions'
import { hydrateImageRefs } from '@kobato/server/domains/images/services/enhance'
import { toCmsPost } from '@kobato/server/domains/posts/projection'

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
  revision?: 'none' | 'published'
  images?: boolean
}

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
