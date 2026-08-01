import type { Database } from '@/server/infra/db/database'
import type { Post, PostVisibilityOptions } from '@/shared/types/catalog'

import { buildPublicPostFilters, hydratePostList } from '@/server/domains/posts/repos/hydrate'
import { listPublicPosts } from '@/server/domains/posts/services/public-query'

/**
 * Like {@link listAllPosts} but loads Portable Text bodies + headings from the
 * published `content` revision. Prefer this when rendering post HTML (feeds);
 * use {@link listAllPosts} when only metadata is needed (sitemap, search index).
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
 * Taxonomy resolution for feed scoping, caller-wired by the renderer: the
 * taxonomies domain already depends on posts, so importing its resolvers
 * here would close the domain DAG (the boundaries contract test pins it).
 */
export interface FeedTaxonomyResolvers {
  resolveCategory: (db: Database, value: string) => Promise<{ id: number } | null>
  resolveTag: (db: Database, value: string) => Promise<{ name: string } | null>
}

/**
 * Post selection for the feed channel (RSS/Atom). Visibility is internal
 * to the feed channel: posts with `visible=false` are included (they stay
 * listed in feeds by design), scheduled posts are not. A category/tag scope resolves
 * slug-or-name through the injected resolvers; an unresolvable scope
 * yields an empty selection (an empty feed, not an error).
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
