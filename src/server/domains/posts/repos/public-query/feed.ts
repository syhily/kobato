import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { Post, PostVisibilityOptions } from '@/shared/types/catalog'

import { buildPublicPostFilters, hydratePostList } from '@/server/domains/posts/repos/hydrate'
import { listPublicPosts } from '@/server/domains/posts/repos/public-query/listing'

/**
 * Like {@link listAllPosts} but loads Portable Text bodies + headings from the
 * published `content` revision. Prefer this when rendering post HTML (feeds);
 * use {@link listAllPosts} when only metadata is needed (sitemap, search index).
 */
export async function listPublicPostsWithContent(
  db: NodePgDatabase,
  options?: PostVisibilityOptions & {
    categoryId?: bigint
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
