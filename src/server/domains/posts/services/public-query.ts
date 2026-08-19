import { and, desc, inArray, isNull, sql } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { PostMetaRow } from '@/server/infra/db/types'
import type { ClientPost, ListingPostCard, Post, PostVisibilityOptions } from '@/shared/types/catalog'

import { queryMetadata } from '@/server/domains/comments/services/likes'
import { applyLimitOffset } from '@/server/domains/content/pagination'
import { isLive } from '@/server/domains/content/schemas/live-gate'
import { livePostWhere } from '@/server/domains/posts/live-gate'
import { buildPublicPostFilters, hydratePostList } from '@/server/domains/posts/repos/hydrate'
import { buildPublicPostsWhere, type ListPublicPostsFilters } from '@/server/domains/posts/repos/shared'
import { post as postMetaTable } from '@/server/infra/db/schema/post'
import { toListingPostCard } from '@/shared/types/catalog'
import { idFromString } from '@/shared/utils/id'

export async function listPublicPosts(
  db: Database,
  filters: ListPublicPostsFilters = {},
  now = new Date(),
): Promise<PostMetaRow[]> {
  const col = filters.sortBy === 'updatedAt' ? postMetaTable.updatedAt : postMetaTable.firstPublishedAt
  const where = buildPublicPostsWhere(filters, now)
  const q = db.select().from(postMetaTable).where(where).orderBy(desc(col))
  return applyLimitOffset(q, filters)
}

export async function countPublicPosts(
  db: Database,
  filters: Omit<ListPublicPostsFilters, 'sortBy' | 'limit' | 'offset'> = {},
  now = new Date(),
): Promise<number> {
  const where = buildPublicPostsWhere(filters, now)
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(postMetaTable)
    .where(where)
  return rows[0]?.count ?? 0
}

/** Cards for one listing page. The filtered count is deliberately not run here — callers needing `total` call `countPublicPosts` themselves. */
export async function listPublicPostCardsPaginated(
  db: Database,
  pageNum: number,
  pageSize: number,
  options?: PostVisibilityOptions & {
    sortBy?: 'publishedAt' | 'updatedAt'
    categoryId?: number
    tag?: string
    /** Override the default offset. Tail-merge callers must base it on the original page size. */
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

/** Slim row for sitemap generation — only the fields needed to derive `permalink` + `lastmod`. */
interface SitemapPostRow {
  slug: string
  firstPublishedAt: Date | null
  publishedAt: Date
}

/**
 * Sitemap projection: applies `livePostWhere` but selects only the slug +
 * date columns — no revision join or image hydration.
 */
export async function listSitemapPosts(db: Database, now = new Date()): Promise<SitemapPostRow[]> {
  return db
    .select({
      slug: postMetaTable.slug,
      firstPublishedAt: postMetaTable.firstPublishedAt,
      publishedAt: postMetaTable.publishedAt,
    })
    .from(postMetaTable)
    .where(livePostWhere({ asOf: now }))
    .orderBy(desc(postMetaTable.firstPublishedAt))
}

/**
 * Hydrates posts by slug, in the caller's slug order — the search pipeline
 * relies on the relevance ranking, so no re-ordering by date.
 */
export async function getPostsBySlugs(
  db: Database,
  slugs: readonly string[],
  options?: PostVisibilityOptions,
): Promise<Post[]> {
  if (slugs.length === 0) {
    return []
  }
  const filters = buildPublicPostFilters(options)
  const rows = await db
    .select()
    .from(postMetaTable)
    .where(and(inArray(postMetaTable.slug, [...slugs]), isNull(postMetaTable.deletedAt)))

  const now = new Date()
  const filteredRows = rows.filter((meta) => {
    const visible = filters.includeHidden || meta.visible
    // `includeScheduled` relaxes only the publishedAt<=now leg — a row without a promoted revision is never public.
    const live = isLive(meta, { asOf: now, includeScheduled: filters.includeScheduled })
    return visible && live
  })
  const order = new Map(slugs.map((slug, index) => [slug, index]))
  filteredRows.sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0))
  return hydratePostList(db, filteredRows)
}
