import type { Database } from '@kobato/server/infra/db/database'
import type { PostMetaRow } from '@kobato/server/infra/db/types'
import type { ClientPost, ListingPostCard, Post, PostVisibilityOptions } from '@kobato/shared/types/catalog'

import { queryMetadata } from '@kobato/server/domains/comments/services/likes'
import { applyLimitOffset } from '@kobato/server/domains/content/pagination'
import { isLive } from '@kobato/server/domains/content/schemas/live-gate'
import { livePostWhere } from '@kobato/server/domains/posts/live-gate'
import { buildPublicPostFilters, hydratePostList } from '@kobato/server/domains/posts/repos/hydrate'
import { buildPublicPostsWhere, type ListPublicPostsFilters } from '@kobato/server/domains/posts/repos/shared'
import { post as postMetaTable } from '@kobato/server/infra/db/schema/post'
import { toListingPostCard } from '@kobato/shared/types/catalog'
import { idFromString } from '@kobato/shared/utils/id'
import { and, desc, inArray, isNull, sql } from 'drizzle-orm'

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

export async function listPublicPostCards(
  db: Database,
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
  db: Database,
  pageNum: number,
  pageSize: number,
  options?: PostVisibilityOptions & {
    sortBy?: 'publishedAt' | 'updatedAt'
    categoryId?: number
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
export interface SitemapPostRow {
  slug: string
  firstPublishedAt: Date | null
  publishedAt: Date
}

/**
 * Sitemap-only projection of published posts. Applies the shared live
 * gate (`livePostWhere`) — every published, non-deleted row with a
 * published revision whose `published_at` is not in the future — but
 * selects only `slug` + `firstPublishedAt` + `publishedAt` to avoid the
 * revision-join + image-hydration fan-out the full `listAllPosts`
 * path performs.
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
 * Hydrates posts by slug. Rows come back in the caller's slug order — the
 * search pipeline passes a relevance-ranked list, so the DB result must not
 * be re-ordered by date.
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
    // The canonical live gate (content/schemas/live-gate.ts). `includeScheduled`
    // relaxes only the publishedAt<=now leg — a row without a promoted
    // revision is never public, scheduled or not.
    const live = isLive(meta, { asOf: now, includeScheduled: filters.includeScheduled })
    return visible && live
  })
  const order = new Map(slugs.map((slug, index) => [slug, index]))
  filteredRows.sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0))
  return hydratePostList(db, filteredRows)
}

export async function listAllPosts(db: Database, options?: PostVisibilityOptions): Promise<Post[]> {
  const filters = buildPublicPostFilters(options)
  const metas = await listPublicPosts(db, { ...filters })
  return hydratePostList(db, metas)
}
