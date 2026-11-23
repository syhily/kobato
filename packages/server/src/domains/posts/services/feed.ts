import type { Post, PostVisibilityOptions } from '@kobato/catalog/model'
import type { Database } from '@kobato/db/sqlite/database'

import { buildPublicPostFilters, hydratePostList } from '@kobato/server/domains/posts/repos/hydrate'
import { listPublicPosts } from '@kobato/server/domains/posts/services/public-query'

export async function listPublicPostsWithContent(
  db: Database,
  options?: PostVisibilityOptions & {
    categoryId?: number
    tag?: string
    sortBy?: 'publishedAt' | 'updatedAt'
    limit?: number
  },
): Promise<Post[]> {
  const filters = buildPublicPostFilters(options)
  const metas = await listPublicPosts(db, {
    ...filters,
    categoryId: options?.categoryId,
    tag: options?.tag,
    sortBy: options?.sortBy,
    limit: options?.limit,
  })
  return hydratePostList(db, metas, { revision: 'published' })
}

export interface FeedPostSelection {
  category?: string
  tag?: string
  limit?: number
}

export interface FeedTaxonomyResolvers {
  resolveCategory: (db: Database, value: string) => Promise<{ id: number } | null>
  resolveTag: (db: Database, value: string) => Promise<{ name: string } | null>
}

export async function selectFeedPosts(
  db: Database,
  options: FeedPostSelection,
  resolvers: FeedTaxonomyResolvers,
): Promise<Post[]> {
  const visibility = {
    includeHidden: true,
    includeScheduled: false,
    limit: options.limit,
  }

  if (options.category !== undefined) {
    const category = await resolvers.resolveCategory(db, options.category)
    if (category === null) {
      return []
    }
    return listPublicPostsWithContent(db, { ...visibility, categoryId: category.id })
  }

  if (options.tag !== undefined) {
    const tag = await resolvers.resolveTag(db, options.tag)
    if (tag === null) {
      return []
    }
    return listPublicPostsWithContent(db, { ...visibility, tag: tag.name })
  }

  return listPublicPostsWithContent(db, visibility)
}
