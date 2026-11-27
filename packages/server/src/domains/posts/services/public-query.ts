import type { ClientPost, ListingPostCard, Post, PostVisibilityOptions } from '@kobato/catalog/model'
import type { Database } from '@kobato/db/sqlite/database'
import type { PostMetaRow } from '@kobato/db/sqlite/types'

import { idFromString } from '@kobato/base/utils/id'
import { toListingPostCard } from '@kobato/catalog/projection'
import {
  countPublicPosts as countPublicPostsOp,
  listPostMetasBySlugs,
  listPublicPostMetas,
  listSitemapPosts as listSitemapPostsOp,
  type PublicPostFilters,
  type SitemapPostRow,
} from '@kobato/db/sqlite/operations/content/post'
import { queryMetadata } from '@kobato/server/domains/comments/services/likes'
import { isLive } from '@kobato/server/domains/content/schemas/live-gate'
import { buildPublicPostFilters, hydratePostList } from '@kobato/server/domains/posts/repos/hydrate'

export type { PublicPostFilters, SitemapPostRow }

export type ListPublicPostsFilters = PublicPostFilters

export async function listPublicPosts(
  db: Database,
  filters: ListPublicPostsFilters = {},
  now = new Date(),
): Promise<PostMetaRow[]> {
  return listPublicPostMetas(db, filters, now)
}

export async function countPublicPosts(
  db: Database,
  filters: Omit<ListPublicPostsFilters, 'sortBy' | 'limit' | 'offset'> = {},
  now = new Date(),
): Promise<number> {
  return countPublicPostsOp(db, filters, now)
}

export async function listSitemapPosts(db: Database, now = new Date()): Promise<SitemapPostRow[]> {
  return listSitemapPostsOp(db, now)
}

export async function listPublicPostCardsPaginated(
  db: Database,
  pageNum: number,
  pageSize: number,
  options?: PostVisibilityOptions & {
    sortBy?: 'publishedAt' | 'updatedAt'
    categoryId?: number
    tag?: string
    offset?: number
  },
): Promise<ListingPostCard[]> {
  const filters = buildPublicPostFilters(options)
  const offset = options?.offset ?? (pageNum - 1) * pageSize
  const metas = await listPublicPosts(db, {
    ...filters,
    sortBy: options?.sortBy,
    categoryId: options?.categoryId,
    tag: options?.tag,
    limit: pageSize,
    offset,
  })
  const posts = await hydratePostList(db, metas)
  return posts.map(toListingPostCard)
}

export async function listClientPosts(
  db: Database,
  options?: PostVisibilityOptions & { limit?: number },
): Promise<ClientPost[]> {
  const filters = buildPublicPostFilters(options)
  const metas = await listPublicPosts(db, { ...filters, limit: options?.limit ?? 200 })
  return hydratePostList(db, metas)
}

export async function getClientPostsWithMetadata<PostLike extends { id: string }>(
  db: Database,
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

export async function getPostsBySlugs(
  db: Database,
  slugs: readonly string[],
  options?: PostVisibilityOptions,
): Promise<Post[]> {
  if (slugs.length === 0) {
    return []
  }
  const filters = buildPublicPostFilters(options)
  const rows = await listPostMetasBySlugs(db, slugs)

  const now = new Date()
  const filteredRows = rows.filter((meta) => {
    const visible = filters.includeHidden || meta.visible
    const live = isLive(meta, { asOf: now, includeScheduled: filters.includeScheduled })
    return visible && live
  })
  const order = new Map(slugs.map((slug, index) => [slug, index]))
  filteredRows.sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0))
  return hydratePostList(db, filteredRows)
}
