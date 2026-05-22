import { and, asc, desc, eq, getColumns, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm'

import type { NewPostMeta, PostMetaRow } from '@/server/infra/db/types'
import type { ClientPost, ListingPostCard, Post, PostVisibilityOptions, SidebarPostLink } from '@/shared/types/catalog'

import { queryMetadata } from '@/server/domains/comments/likes'
import { hydrateImageRefs } from '@/server/domains/images/image-meta'
import { findContentById, findContentsByIds, listPublicPageMetas } from '@/server/domains/pages/repo'
import { toCmsPost } from '@/server/domains/posts/projection'
import { db } from '@/server/infra/db/pool'
import { post as postMetaTable, user } from '@/server/infra/db/schema'
import { requireBlogSettingsSection } from '@/shared/config/blog'
import { toListingPostCard, toSidebarPostLink } from '@/shared/types/catalog'
import { escapeLikePattern } from '@/shared/utils/escape-like'
import { idFromString } from '@/shared/utils/id'
import { shuffle } from '@/shared/utils/tools'

export type { ContentType } from '@/server/domains/content/schema'
export {
  findContentById,
  findContentsByIds,
  findLatestRevision,
  findLatestDraft,
  listRevisions,
  saveDraftRevision,
  publishLatestRevision,
  maxRevisionNo,
} from '@/server/domains/content/repo'

// --- Reads -------------------------------------------------------------------

export type PostMetaWithAuthor = PostMetaRow & { authorName: string | null }

export interface ListPostsFilters {
  /** Free-text query matched case-insensitively against `slug` and `title`. */
  q?: string
  /** Deletion state filter. */
  deletedStatus?: 'all' | 'deleted' | 'normal'
  /** Zero-based offset for pagination. */
  offset?: number
  /** Page size. When undefined every match is returned. */
  limit?: number
  /** Filter by category name. */
  category?: string
  /** Filter by tag name (JSONB contains). */
  tag?: string
  /** Filter by published flag. */
  published?: boolean
  /** Filter by visible flag. */
  visible?: boolean
  /** Sort field. */
  sortBy?: 'publishedAt' | 'updatedAt'
  /** Sort direction. */
  sortOrder?: 'asc' | 'desc'
  /** Filter by author id. */
  authorId?: bigint
  /**
   * Coarse lifecycle bucket — partitions every live row into one of two
   * sets that match the `StatusBadge` logic in `PostsView`:
   *   - `'published'`: `published = true AND published_revision_id IS NOT NULL`
   *                   (publicly visible on the site).
   *   - `'draft'`: everything else (`published = false`, OR
   *                `published_revision_id IS NULL` meaning the row has
   *                only ever held draft revisions / was never promoted).
   *
   * Use this for "drafts vs published" dashboards instead of `published`
   * alone — the boolean flag misses the common "freshly created but
   * not yet promoted" case where the row sits at `published = true`,
   * `published_revision_id = NULL` and is what users intuitively call
   * a draft.
   */
  lifecycle?: 'draft' | 'published'
}

function buildPostsWhere(filters: ListPostsFilters): SQL | undefined {
  const conditions: SQL[] = []
  if (filters.deletedStatus === 'deleted') {
    conditions.push(isNotNull(postMetaTable.deletedAt))
  } else if (filters.deletedStatus === 'normal') {
    conditions.push(isNull(postMetaTable.deletedAt))
  }
  if (filters.q && filters.q.trim() !== '') {
    const pattern = `%${escapeLikePattern(filters.q.trim())}%`
    conditions.push(sql`(${postMetaTable.slug} ILIKE ${pattern} OR ${postMetaTable.title} ILIKE ${pattern})`)
  }
  if (filters.category) {
    conditions.push(eq(postMetaTable.category, filters.category))
  }
  if (filters.tag) {
    conditions.push(sql`${postMetaTable.tags} @> ${JSON.stringify([filters.tag])}::jsonb`)
  }
  if (filters.published !== undefined) {
    conditions.push(eq(postMetaTable.published, filters.published))
  }
  if (filters.visible !== undefined) {
    conditions.push(eq(postMetaTable.visible, filters.visible))
  }
  if (filters.authorId !== undefined) {
    conditions.push(eq(postMetaTable.authorId, filters.authorId))
  }
  if (filters.lifecycle === 'published') {
    conditions.push(eq(postMetaTable.published, true), isNotNull(postMetaTable.publishedRevisionId))
  } else if (filters.lifecycle === 'draft') {
    const draftClause = or(eq(postMetaTable.published, false), isNull(postMetaTable.publishedRevisionId))
    if (draftClause !== undefined) {
      conditions.push(draftClause)
    }
  }
  if (conditions.length === 0) {
    return undefined
  }
  if (conditions.length === 1) {
    return conditions[0]
  }
  return and(...conditions)
}

function buildPostsOrderBy(filters: ListPostsFilters) {
  const col = filters.sortBy === 'updatedAt' ? postMetaTable.updatedAt : postMetaTable.firstPublishedAt
  return filters.sortOrder === 'asc' ? asc(col) : desc(col)
}

export async function listPostMetas(filters: ListPostsFilters = {}): Promise<PostMetaWithAuthor[]> {
  const where = buildPostsWhere(filters)
  const base = db
    .select({
      ...getColumns(postMetaTable),
      authorName: user.name,
    })
    .from(postMetaTable)
    .leftJoin(user, eq(user.id, postMetaTable.authorId))
    .orderBy(buildPostsOrderBy(filters))
  let q = where ? base.where(where) : base
  if (filters.limit !== undefined) {
    q = q.limit(filters.limit) as typeof q
  }
  if (filters.offset !== undefined && filters.offset > 0) {
    q = q.offset(filters.offset) as typeof q
  }
  return q
}

export async function countPostMetas(filters: ListPostsFilters = {}): Promise<number> {
  const where = buildPostsWhere(filters)
  const builder = where
    ? db
        .select({ count: sql<number>`count(*)::int` })
        .from(postMetaTable)
        .where(where)
    : db.select({ count: sql<number>`count(*)::int` }).from(postMetaTable)
  const rows = await builder
  return rows[0]?.count ?? 0
}

export async function findPostMetaById(id: bigint): Promise<PostMetaRow | null> {
  const rows = await db.select().from(postMetaTable).where(eq(postMetaTable.id, id)).limit(1)
  return rows[0] ?? null
}

export async function findPostMetaBySlug(slug: string): Promise<PostMetaRow | null> {
  const rows = await db.select().from(postMetaTable).where(eq(postMetaTable.slug, slug)).limit(1)
  return rows[0] ?? null
}

export async function findPublicPostMetaBySlug(slug: string): Promise<PostMetaRow | null> {
  const rows = await db
    .select()
    .from(postMetaTable)
    .where(and(eq(postMetaTable.slug, slug), isNull(postMetaTable.deletedAt)))
    .limit(1)
  return rows[0] ?? null
}

export async function listPublicPostMetas(sortBy: 'publishedAt' | 'updatedAt' = 'publishedAt'): Promise<PostMetaRow[]> {
  const col = sortBy === 'updatedAt' ? postMetaTable.updatedAt : postMetaTable.firstPublishedAt
  return db.select().from(postMetaTable).where(isNull(postMetaTable.deletedAt)).orderBy(desc(col))
}

// --- Public listing helpers (database-level pagination) ----------------------

export interface ListPublicPostsFilters {
  category?: string
  tag?: string
  includeHidden?: boolean
  includeScheduled?: boolean
  sortBy?: 'publishedAt' | 'updatedAt'
  limit?: number
  offset?: number
}

function buildPublicPostsWhere(filters: ListPublicPostsFilters): SQL {
  const conditions: SQL[] = [
    isNull(postMetaTable.deletedAt),
    eq(postMetaTable.published, true),
    isNotNull(postMetaTable.publishedRevisionId),
  ]

  if (!filters.includeHidden) {
    conditions.push(eq(postMetaTable.visible, true))
  }
  if (!filters.includeScheduled) {
    conditions.push(sql`${postMetaTable.publishedAt} <= ${new Date()}`)
  }
  if (filters.category) {
    conditions.push(eq(postMetaTable.category, filters.category))
  }
  if (filters.tag) {
    conditions.push(sql`${postMetaTable.tags} @> ${JSON.stringify([filters.tag])}::jsonb`)
  }

  return and(...conditions)!
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

// --- Writes ------------------------------------------------------------------

export async function insertPostMeta(values: NewPostMeta): Promise<PostMetaRow> {
  const rows = await db.insert(postMetaTable).values(values).returning()
  return rows[0]
}

export async function updatePostMetaById(
  id: bigint,
  patch: Partial<Omit<NewPostMeta, 'id' | 'createdAt'>>,
): Promise<PostMetaRow | null> {
  const rows = await db
    .update(postMetaTable)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(postMetaTable.id, id))
    .returning()
  return rows[0] ?? null
}

export async function softDeletePostMeta(id: bigint, tx = db): Promise<boolean> {
  const now = new Date()
  const rows = await tx
    .update(postMetaTable)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(postMetaTable.id, id), isNull(postMetaTable.deletedAt)))
    .returning({ id: postMetaTable.id })
  return rows.length > 0
}

export async function restorePostMeta(id: bigint, tx = db): Promise<boolean> {
  const rows = await tx
    .update(postMetaTable)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(eq(postMetaTable.id, id))
    .returning({ id: postMetaTable.id })
  return rows.length > 0
}

// --- Hydration ---------------------------------------------------------------

async function hydratePostImages(posts: Post[]): Promise<void> {
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
}

async function hydrateClientPostCovers(posts: ClientPost[]): Promise<void> {
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
}

/** Join published `content` rows so callers receive a real `Post` with `body` (RSS, detail routes, etc.). */
async function hydratePostMetasToFullPosts(metas: PostMetaRow[]): Promise<Post[]> {
  if (metas.length === 0) {
    return []
  }
  const revisionIds = metas.map((m) => m.publishedRevisionId).filter((id): id is bigint => id !== null)
  const revisionMap = new Map<bigint, Awaited<ReturnType<typeof findContentsByIds>>[number]>()
  if (revisionIds.length > 0) {
    const rows = await findContentsByIds(revisionIds)
    for (const row of rows) {
      revisionMap.set(row.id, row)
    }
  }
  const posts = metas.map((meta) => {
    const revision = meta.publishedRevisionId === null ? null : (revisionMap.get(meta.publishedRevisionId) ?? null)
    return toCmsPost(meta, revision)
  })
  await hydratePostImages(posts)
  return posts
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

// --- Lightweight projection (no content join) --------------------------------

/** Public `date` is first publication time; falls back to `published_at` before the first publish. */
export function toClientPostFromMeta(meta: PostMetaRow): ClientPost {
  const date = meta.firstPublishedAt ?? meta.publishedAt
  return {
    id: String(meta.id),
    title: meta.title,
    date,
    updated: meta.publishedAt,
    comments: meta.commentsEnabled,
    alias: (meta.alias as string[]) ?? [],
    tags: (meta.tags as string[]) ?? [],
    category: meta.category,
    summary: meta.summary,
    cover: meta.cover || '/images/open-graph.png',
    og: meta.og ?? undefined,
    published: meta.published,
    visible: meta.visible,
    toc: meta.showToc,
    showUpdated: meta.showUpdated,
    slug: meta.slug,
    permalink: `/posts/${meta.slug}`,
    headings: [],
    pinnedAt: meta.pinnedAt ?? undefined,
  }
}

function toPostFromMeta(meta: PostMetaRow): Post {
  return {
    ...toClientPostFromMeta(meta),
    body: [],
    imageSources: [],
    publishedRevisionId: meta.publishedRevisionId,
  }
}

function buildPublicPostFilters(
  options?: PostVisibilityOptions,
): Omit<ListPublicPostsFilters, 'sortBy' | 'limit' | 'offset'> {
  return {
    includeHidden: options?.includeHidden ?? false,
    includeScheduled: options?.includeScheduled ?? false,
  }
}

// --- Single lookups ----------------------------------------------------------

export async function findPostBySlug(slug: string): Promise<Post | null> {
  const meta = await findPublicPostMetaBySlug(slug)
  if (meta === null || !meta.published || meta.publishedRevisionId === null) {
    return null
  }
  const revision = meta.publishedRevisionId === null ? null : await findContentById(meta.publishedRevisionId)
  const post = toCmsPost(meta, revision) as unknown as Post
  await hydratePostImages([post])
  return post
}

export async function findPostBySlugForAdmin(slug: string): Promise<Post | null> {
  const meta = await findPostMetaBySlug(slug)
  if (meta === null) {
    return null
  }
  const revision = meta.publishedRevisionId === null ? null : await findContentById(meta.publishedRevisionId)
  const post = toCmsPost(meta, revision) as unknown as Post
  await hydratePostImages([post])
  return post
}

// --- Listing queries ---------------------------------------------------------

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

// --- Metadata ----------------------------------------------------------------

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

// --- Feature / Sidebar -------------------------------------------------------

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
    .orderBy(sql`RANDOM()`)
    .limit(count)
  return metas.map((meta) => toClientPostFromMeta(meta)).map(toSidebarPostLink)
}

// --- Permalink set -----------------------------------------------------------

export async function buildPermalinkSet(): Promise<Set<string>> {
  const [postMetas, pageMetas] = await Promise.all([listPublicPosts({}), listPublicPageMetas()])
  return new Set([...postMetas.map((p) => `/posts/${p.slug}`), ...pageMetas.map((p) => `/${p.slug}`)])
}
