import type { Database } from '@/server/infra/db/database'
import type { Post, PostVisibilityOptions } from '@/shared/types/catalog'

import { buildPublicPostFilters, hydratePostList } from '@/server/domains/posts/repos/hydrate'
import { listPublicPosts } from '@/server/domains/posts/services/public-query'

/**
 * Like {@link listAllPosts} but loads bodies + headings from the published
 * `content` revision — use for feeds, {@link listAllPosts} for metadata only.
 */
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

/**
 * Taxonomy resolution for feed scoping, caller-wired by the renderer —
 * importing the taxonomies resolvers would close the domain DAG.
 */
export interface FeedTaxonomyResolvers {
  resolveCategory: (db: Database, value: string) => Promise<{ id: number } | null>
  resolveTag: (db: Database, value: string) => Promise<{ name: string } | null>
}

/**
 * Post selection for the feed channel: `visible=false` posts stay listed,
 * scheduled posts do not; an unresolvable scope yields an empty feed.
 */
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
