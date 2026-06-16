import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { desc, isNull, sql } from 'drizzle-orm'

import type { PostMetaRow } from '@/server/infra/db/types'
import type { ClientPost, ListingPostCard, PostVisibilityOptions } from '@/shared/types/catalog'

import { queryMetadata } from '@/server/domains/comments/services/likes'
import { hydrateImageRefs } from '@/server/domains/images/services/enhance'
import { buildPublicPostFilters } from '@/server/domains/posts/repos/hydrate'
import {
  buildPublicPostsWhere,
  toClientPostFromMeta,
  type ListPublicPostsFilters,
} from '@/server/domains/posts/repos/shared'
import { findTagNamesByPostIds } from '@/server/infra/db/operations/post-tag'
import { post as postMetaTable } from '@/server/infra/db/schema/post'
import { toListingPostCard } from '@/shared/types/catalog'
import { idFromString } from '@/shared/utils/id'

export async function listPublicPostMetas(
  db: NodePgDatabase,
  sortBy: 'publishedAt' | 'updatedAt' = 'publishedAt',
  limit = 200,
): Promise<PostMetaRow[]> {
  const col = sortBy === 'updatedAt' ? postMetaTable.updatedAt : postMetaTable.firstPublishedAt
  return db.select().from(postMetaTable).where(isNull(postMetaTable.deletedAt)).orderBy(desc(col)).limit(limit)
}

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
  const tagMap = await findTagNamesByPostIds(
    db,
    metas.map((m) => m.id),
  )
  return metas.map((meta) => toClientPostFromMeta(meta, tagMap.get(meta.id) ?? [])).map(toListingPostCard)
}

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
): Promise<{ posts: ListingPostCard[]; total: number }> {
  const filters = buildPublicPostFilters(options)
  const offset = options?.offset ?? (pageNum - 1) * pageSize
  const now = new Date()
  const [metas, total] = await Promise.all([
    listPublicPosts(
      db,
      {
        ...filters,
        sortBy: options?.sortBy,
        category: options?.category,
        tag: options?.tag,
        limit: pageSize,
        offset,
      },
      now,
    ),
    countPublicPosts(db, { ...filters, category: options?.category, tag: options?.tag }, now),
  ])
  const tagMap = await findTagNamesByPostIds(
    db,
    metas.map((m) => m.id),
  )
  const posts = metas.map((meta) => toClientPostFromMeta(meta, tagMap.get(meta.id) ?? [])).map(toListingPostCard)
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
  return { posts, total }
}

export async function listClientPosts(
  db: NodePgDatabase,
  options?: PostVisibilityOptions & { limit?: number },
): Promise<ClientPost[]> {
  const filters = buildPublicPostFilters(options)
  const metas = await listPublicPosts(db, { ...filters, limit: options?.limit ?? 200 })
  const tagMap = await findTagNamesByPostIds(
    db,
    metas.map((m) => m.id),
  )
  const posts = metas.map((meta) => toClientPostFromMeta(meta, tagMap.get(meta.id) ?? []))
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
  return posts
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
