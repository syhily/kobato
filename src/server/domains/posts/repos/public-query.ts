import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'

import type { PostMetaRow } from '@/server/infra/db/types'
import type { ClientPost, ListingPostCard, Post, PostVisibilityOptions, SidebarPostLink } from '@/shared/types/catalog'

import { queryMetadata } from '@/server/domains/comments/likes'
import { hydrateImageRefs } from '@/server/domains/images/image-meta'
import {
  buildPublicPostFilters,
  hydrateClientPostCovers,
  hydratePostImages,
  hydratePostMetasToFullPosts,
} from '@/server/domains/posts/repos/hydrate'
import {
  buildPublicPostsWhere,
  toClientPostFromMeta,
  type ListPublicPostsFilters,
} from '@/server/domains/posts/repos/shared'
import { toPostFromMeta } from '@/server/domains/posts/repos/single'
import { db } from '@/server/infra/db/pool'
import { post as postMetaTable } from '@/server/infra/db/schema/post'
import { requireBlogSettingsSection } from '@/shared/config/blog'
import { toListingPostCard, toSidebarPostLink } from '@/shared/types/catalog'
import { idFromString } from '@/shared/utils/id'
import { shuffle } from '@/shared/utils/tools'

export { toClientPostFromMeta } from '@/server/domains/posts/repos/shared'

export async function listPublicPostMetas(sortBy: 'publishedAt' | 'updatedAt' = 'publishedAt'): Promise<PostMetaRow[]> {
  const col = sortBy === 'updatedAt' ? postMetaTable.updatedAt : postMetaTable.firstPublishedAt
  return db.select().from(postMetaTable).where(isNull(postMetaTable.deletedAt)).orderBy(desc(col))
}

export async function listPublicPosts(filters: ListPublicPostsFilters = {}): Promise<PostMetaRow[]> {
  const col = filters.sortBy === 'updatedAt' ? postMetaTable.updatedAt : postMetaTable.firstPublishedAt
  const where = buildPublicPostsWhere(filters)
  let q = db.select().from(postMetaTable).where(where).orderBy(desc(col))
  if (filters.limit !== undefined) {
    q = q.limit(filters.limit) as typeof q
  }
  if (filters.offset !== undefined && filters.offset > 0) {
    q = q.offset(filters.offset) as typeof q
  }
  const result = await q
  return result
}

export async function countPublicPosts(
  filters: Omit<ListPublicPostsFilters, 'sortBy' | 'limit' | 'offset'> = {},
): Promise<number> {
  const where = buildPublicPostsWhere(filters)
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postMetaTable)
    .where(where)
  return rows[0]?.count ?? 0
}

export async function listPublicPostCards(
  options?: PostVisibilityOptions & { sortBy?: 'publishedAt' | 'updatedAt' },
): Promise<ListingPostCard[]> {
  const filters = buildPublicPostFilters(options)
  const metas = await listPublicPosts({ ...filters, sortBy: options?.sortBy })
  return metas.map((meta) => toClientPostFromMeta(meta)).map(toListingPostCard)
}

export async function listPublicPostCardsPaginated(
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
  const [metas, total] = await Promise.all([
    listPublicPosts({
      ...filters,
      sortBy: options?.sortBy,
      category: options?.category,
      tag: options?.tag,
      limit: pageSize,
      offset,
    }),
    countPublicPosts({ ...filters, category: options?.category, tag: options?.tag }),
  ])
  const posts = metas.map((meta) => toClientPostFromMeta(meta)).map(toListingPostCard)
  await hydrateImageRefs(
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

/**
 * Like {@link listAllPosts} but loads Portable Text bodies + headings from the
 * published `content` revision. Prefer this when rendering post HTML (feeds);
 * use {@link listAllPosts} when only metadata is needed (sitemap, search index).
 */
export async function listPublicPostsWithContent(
  options?: PostVisibilityOptions & {
    category?: string
    tag?: string
    sortBy?: 'publishedAt' | 'updatedAt'
  },
): Promise<Post[]> {
  const filters = buildPublicPostFilters(options)
  const metas = await listPublicPosts({
    ...filters,
    category: options?.category,
    tag: options?.tag,
    sortBy: options?.sortBy,
  })
  return hydratePostMetasToFullPosts(metas)
}

export async function listPostsByCategory(category: string, options?: PostVisibilityOptions): Promise<Post[]> {
  const filters = buildPublicPostFilters(options)
  const metas = await listPublicPosts({ ...filters, category })
  const posts = metas.map((meta) => toPostFromMeta(meta))
  await hydratePostImages(posts)
  return posts
}

export async function listPostsByTag(tag: string, options?: PostVisibilityOptions): Promise<Post[]> {
  const filters = buildPublicPostFilters(options)
  const metas = await listPublicPosts({ ...filters, tag })
  const posts = metas.map((meta) => toPostFromMeta(meta))
  await hydratePostImages(posts)
  return posts
}

export async function getPostsBySlugs(slugs: readonly string[], options?: PostVisibilityOptions): Promise<Post[]> {
  if (slugs.length === 0) {
    return []
  }
  const filters = buildPublicPostFilters(options)
  const rows = await db
    .select()
    .from(postMetaTable)
    .where(and(inArray(postMetaTable.slug, [...slugs]), isNull(postMetaTable.deletedAt)))
    .orderBy(desc(postMetaTable.firstPublishedAt))

  const now = new Date()
  const posts = rows
    .filter((meta) => {
      const visible = filters.includeHidden || meta.visible
      const published = filters.includeScheduled || meta.publishedAt <= now
      return visible && published && meta.published
    })
    .map((meta) => toPostFromMeta(meta))
  await hydratePostImages(posts)
  return posts
}

export async function listAllPosts(options?: PostVisibilityOptions): Promise<Post[]> {
  const filters = buildPublicPostFilters(options)
  const metas = await listPublicPosts({ ...filters })
  const posts = metas.map((meta) => toPostFromMeta(meta))
  await hydratePostImages(posts)
  return posts
}

export async function listClientPosts(options?: PostVisibilityOptions): Promise<ClientPost[]> {
  const filters = buildPublicPostFilters(options)
  const metas = await listPublicPosts({ ...filters })
  const posts = metas.map((meta) => toClientPostFromMeta(meta))
  await hydrateImageRefs(
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
  posts: PostLike[],
  options: { likes: boolean; views: boolean; comments: boolean },
): Promise<(PostLike & { meta: { likes: number; views: number; comments: number } })[]> {
  if (posts.length === 0) {
    return []
  }
  const metas = await queryMetadata(
    posts.map((post) => ({ type: 'post' as const, ownerId: idFromString(post.id) })),
    options,
  )
  return posts.map((post) => {
    const key = `post:${post.id}`
    const meta = metas.get(key) ?? { likes: 0, views: 0, comments: 0, publicId: '' }
    return { ...post, meta: { likes: meta.likes, views: meta.views, comments: meta.comments } }
  })
}

const FEATURE_POST_COUNT = 3

export async function selectFeaturePosts(seed: string): Promise<ClientPost[]> {
  const content = requireBlogSettingsSection('content')
  if (!content.post.featureEnabled) {
    return []
  }

  const now = new Date()
  const publicWhere = and(
    isNull(postMetaTable.deletedAt),
    eq(postMetaTable.published, true),
    isNotNull(postMetaTable.publishedRevisionId),
    eq(postMetaTable.visible, true),
    sql`${postMetaTable.publishedAt} <= ${now}`,
  )

  const pinnedMetas = await db
    .select()
    .from(postMetaTable)
    .where(and(publicWhere, isNotNull(postMetaTable.pinnedAt)))
    .orderBy(desc(postMetaTable.pinnedAt))
    .limit(FEATURE_POST_COUNT)

  const pinned = pinnedMetas.map((meta) => toClientPostFromMeta(meta))
  if (pinned.length === FEATURE_POST_COUNT) {
    await hydrateClientPostCovers(pinned)
    return pinned
  }

  const pageSize = content.pagination.posts
  const recentWindow = pageSize * 2

  const [recentMetas, allWithCover] = await Promise.all([
    db
      .select({ id: postMetaTable.id })
      .from(postMetaTable)
      .where(publicWhere)
      .orderBy(desc(postMetaTable.firstPublishedAt))
      .limit(recentWindow),
    db
      .select()
      .from(postMetaTable)
      .where(and(publicWhere, sql`${postMetaTable.cover} <> ''`))
      .orderBy(desc(postMetaTable.firstPublishedAt)),
  ])

  const recentIds = new Set(recentMetas.map((r) => r.id))
  const pinnedSlugs = new Set(pinned.map((p) => p.slug))
  const candidates = allWithCover
    .filter((m) => !pinnedSlugs.has(m.slug) && !recentIds.has(m.id))
    .map((meta) => toClientPostFromMeta(meta))

  const withCover = candidates.filter((post) => post.cover)
  const pool = withCover.length >= FEATURE_POST_COUNT - pinned.length ? withCover : candidates

  let result: ClientPost[]
  if (pool.length + pinned.length < FEATURE_POST_COUNT) {
    const fallbackPool = candidates
    result = [...pinned, ...fallbackPool].slice(0, FEATURE_POST_COUNT)
  } else {
    const shuffled = shuffle(pool, `feature-posts:${seed}:${pool.length}`)
    result = [...pinned, ...shuffled.slice(0, FEATURE_POST_COUNT - pinned.length)]
  }

  await hydrateClientPostCovers(result)
  return result
}

export async function selectSidebarPosts(count: number): Promise<SidebarPostLink[]> {
  if (count <= 0) {
    return []
  }
  const metas = await db
    .select()
    .from(postMetaTable)
    .where(
      and(
        isNull(postMetaTable.deletedAt),
        eq(postMetaTable.published, true),
        isNotNull(postMetaTable.publishedRevisionId),
        eq(postMetaTable.visible, true),
        sql`${postMetaTable.publishedAt} <= ${new Date()}`,
      ),
    )
    .orderBy(sql`md5(${postMetaTable.id}::text)`)
    .limit(count)
  return metas.map((meta) => toClientPostFromMeta(meta)).map(toSidebarPostLink)
}
