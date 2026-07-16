import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { desc, sql } from 'drizzle-orm'

import type { PostMetaRow } from '@/server/infra/db/types'
import type { ClientPost, ListingPostCard, PostVisibilityOptions } from '@/shared/types/catalog'

import { queryMetadata } from '@/server/domains/comments/services/likes'
import { buildPublicPostFilters, hydratePostList } from '@/server/domains/posts/repos/hydrate'
import { buildPublicPostsWhere, type ListPublicPostsFilters } from '@/server/domains/posts/repos/shared'
import { post as postMetaTable } from '@/server/infra/db/schema/post'
import { toListingPostCard } from '@/shared/types/catalog'
import { idFromString } from '@/shared/utils/id'

export async function listPublicPosts(
  db: NodePgDatabase,
  filters: ListPublicPostsFilters = {},
  now = new Date(),
): Promise<PostMetaRow[]> {
  const col = filters.sortBy === 'updatedAt' ? postMetaTable.updatedAt : postMetaTable.firstPublishedAt
  const where = buildPublicPostsWhere(filters, now)
  const q = db.select().from(postMetaTable).where(where).orderBy(desc(col))
  if (filters.limit !== undefined) {
    if (filters.offset !== undefined && filters.offset > 0) {
      const result = await q.limit(filters.limit).offset(filters.offset)
      return result
    }
    const result = await q.limit(filters.limit)
    return result
  }
  if (filters.offset !== undefined && filters.offset > 0) {
    const result = await q.offset(filters.offset)
    return result
  }
  const result = await q
  return result
}

export async function countPublicPosts(
  db: NodePgDatabase,
  filters: Omit<ListPublicPostsFilters, 'sortBy' | 'limit' | 'offset'> = {},
  now = new Date(),
): Promise<number> {
  const where = buildPublicPostsWhere(filters, now)
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postMetaTable)
    .where(where)
  return rows[0]?.count ?? 0
}

export async function listPublicPostCards(
  db: NodePgDatabase,
  options?: PostVisibilityOptions & { sortBy?: 'publishedAt' | 'updatedAt' },
): Promise<ListingPostCard[]> {
  const filters = buildPublicPostFilters(options)
  const metas = await listPublicPosts(db, { ...filters, sortBy: options?.sortBy })
  const posts = await hydratePostList(db, metas, { images: false })
  return posts.map(toListingPostCard)
}

/** Cards for one listing page. The filtered count is deliberately not run
    here: callers that need `total` call `countPublicPosts` themselves (all
    current callers already do), so the count runs once per request. */
export async function listPublicPostCardsPaginated(
  db: NodePgDatabase,
  pageNum: number,
  pageSize: number,
  options?: PostVisibilityOptions & {
    sortBy?: 'publishedAt' | 'updatedAt'
    category?: string
    tag?: string
    /** Override the default offset (`(pageNum - 1) * pageSize`). Used when the
        caller's pagination logic expands the last-page limit (tail-merge) so
        the offset must still be based on the original page size. */
    offset?: number
  },
): Promise<ListingPostCard[]> {
  const filters = buildPublicPostFilters(options)
  const offset = options?.offset ?? (pageNum - 1) * pageSize
  const metas = await listPublicPosts(db, {
    ...filters,
    sortBy: options?.sortBy,
    category: options?.category,
    tag: options?.tag,
    limit: pageSize,
    offset,
  })
  const posts = await hydratePostList(db, metas)
  return posts.map(toListingPostCard)
}

export async function listClientPosts(
  db: NodePgDatabase,
  options?: PostVisibilityOptions & { limit?: number },
): Promise<ClientPost[]> {
  const filters = buildPublicPostFilters(options)
  const metas = await listPublicPosts(db, { ...filters, limit: options?.limit ?? 200 })
  return hydratePostList(db, metas)
}

export async function getClientPostsWithMetadata<PostLike extends { id: string }>(
  db: NodePgDatabase,
  posts: PostLike[],
  options: { likes: boolean; views: boolean; comments: boolean },
): Promise<(PostLike & { meta: { likes: number; views: number; comments: number } })[]> {
  if (posts.length === 0) {
    return []
  }
  const metas = await queryMetadata(
    db,
    posts.map((post) => ({ type: 'post' as const, ownerId: idFromString(post.id) })),
    options,
  )
  return posts.map((post) => {
    const key = `post:${post.id}`
    const meta = metas.get(key) ?? { likes: 0, views: 0, comments: 0, publicId: '' }
    return { ...post, meta: { likes: meta.likes, views: meta.views, comments: meta.comments } }
  })
}
