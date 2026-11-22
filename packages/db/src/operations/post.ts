import type { Database } from '@kobato/db/database'
import type { ContentRow, PostMetaRow } from '@kobato/db/types'

import { sqliteOf } from '@kobato/db/database'
import { liveEntityWhere } from '@kobato/db/operations/entity-meta'
import { content as contentTable } from '@kobato/db/schema/content'
import { page as pageMetaTable } from '@kobato/db/schema/page'
import { post as postMetaTable } from '@kobato/db/schema/post'
import { postTag } from '@kobato/db/schema/post-tag'
import { category as categoryTable, tag as tagTable } from '@kobato/db/schema/taxonomy'
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm'

export interface PublicPostFilters {
  categoryId?: number
  tag?: string
  includeHidden?: boolean
  includeScheduled?: boolean
  sortBy?: 'publishedAt' | 'updatedAt'
  limit?: number
  offset?: number
}

function buildPublicPostsWhere(filters: PublicPostFilters, now = new Date()): SQL {
  const conditions: SQL[] = [liveEntityWhere(postMetaTable, { asOf: now, includeScheduled: filters.includeScheduled })]
  if (!filters.includeHidden) {
    conditions.push(eq(postMetaTable.visible, true))
  }
  if (filters.categoryId !== undefined) {
    conditions.push(eq(postMetaTable.categoryId, filters.categoryId))
  }
  if (filters.tag) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM ${postTag}
        INNER JOIN ${tagTable} ON ${eq(postTag.tagId, tagTable.id)}
        WHERE ${eq(postTag.postId, postMetaTable.id)} AND ${eq(tagTable.name, filters.tag)}
      )`,
    )
  }
  return and(...conditions)!
}

export async function listPublicPostMetas(
  db: Database,
  filters: PublicPostFilters = {},
  now = new Date(),
): Promise<PostMetaRow[]> {
  const col = filters.sortBy === 'updatedAt' ? postMetaTable.updatedAt : postMetaTable.firstPublishedAt
  const base = sqliteOf(db).select().from(postMetaTable).where(buildPublicPostsWhere(filters, now)).orderBy(desc(col))
  if (filters.limit !== undefined) {
    if (filters.offset !== undefined && filters.offset > 0) {
      return base.limit(filters.limit).offset(filters.offset)
    }
    return base.limit(filters.limit)
  }
  if (filters.offset !== undefined && filters.offset > 0) {
    return base.offset(filters.offset)
  }
  return base
}

export async function countPublicPosts(
  db: Database,
  filters: Omit<PublicPostFilters, 'sortBy' | 'limit' | 'offset'> = {},
  now = new Date(),
): Promise<number> {
  const rows = await sqliteOf(db)
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(postMetaTable)
    .where(buildPublicPostsWhere(filters, now))
  return rows[0]?.count ?? 0
}

export interface SitemapPostRow {
  slug: string
  firstPublishedAt: Date | null
  publishedAt: Date
}

export async function listSitemapPosts(db: Database, now = new Date()): Promise<SitemapPostRow[]> {
  return sqliteOf(db)
    .select({
      slug: postMetaTable.slug,
      firstPublishedAt: postMetaTable.firstPublishedAt,
      publishedAt: postMetaTable.publishedAt,
    })
    .from(postMetaTable)
    .where(liveEntityWhere(postMetaTable, { asOf: now }))
    .orderBy(desc(postMetaTable.firstPublishedAt))
}

export async function findLivePostBySlug(db: Database, slug: string): Promise<{ id: number; title: string } | null> {
  const rows = await sqliteOf(db)
    .select({ id: postMetaTable.id, title: postMetaTable.title })
    .from(postMetaTable)
    .where(and(eq(postMetaTable.slug, slug), liveEntityWhere(postMetaTable)))
    .limit(1)
  return rows[0] ?? null
}

export interface PostWithRevision {
  meta: PostMetaRow
  revision: ContentRow | null
}

function whereSlugOrAlias(slug: string): SQL {
  return sql`EXISTS (SELECT 1 FROM json_each(${postMetaTable.alias}) WHERE json_each.value = ${slug})`
}

async function findPostWithRevisionWhere(db: Database, where: SQL): Promise<PostWithRevision | null> {
  const rows = await sqliteOf(db)
    .select()
    .from(postMetaTable)
    .leftJoin(contentTable, eq(postMetaTable.publishedRevisionId, contentTable.id))
    .where(where)
    .limit(1)
  if (rows.length === 0) {
    return null
  }
  const { post, content } = rows[0]
  return { meta: post as PostMetaRow, revision: content as ContentRow | null }
}

/**
 * Finds a live post by slug first, then by alias, joining the published revision.
 */
export async function findLivePostWithRevisionBySlugOrAlias(
  db: Database,
  slug: string,
): Promise<PostWithRevision | null> {
  const live = liveEntityWhere(postMetaTable)
  const result =
    (await findPostWithRevisionWhere(db, and(eq(postMetaTable.slug, slug), live)!)) ??
    (await findPostWithRevisionWhere(db, and(whereSlugOrAlias(slug), live)!))
  return result
}

export async function listPostMetasBySlugs(db: Database, slugs: readonly string[]): Promise<PostMetaRow[]> {
  if (slugs.length === 0) {
    return []
  }
  return sqliteOf(db)
    .select()
    .from(postMetaTable)
    .where(and(inArray(postMetaTable.slug, [...slugs]), isNull(postMetaTable.deletedAt)))
}

// ---------------------------------------------------------------------------
// Featured / sidebar selection building blocks
// ---------------------------------------------------------------------------

export async function listPinnedLiveVisiblePostMetas(
  db: Database,
  limit: number,
  now = new Date(),
): Promise<PostMetaRow[]> {
  return sqliteOf(db)
    .select()
    .from(postMetaTable)
    .where(
      and(
        liveEntityWhere(postMetaTable, { asOf: now }),
        eq(postMetaTable.visible, true),
        isNotNull(postMetaTable.pinnedAt),
      ),
    )
    .orderBy(desc(postMetaTable.pinnedAt))
    .limit(limit)
}

export async function listLiveVisiblePostIds(
  db: Database,
  limit: number | undefined,
  now = new Date(),
): Promise<number[]> {
  const base = sqliteOf(db)
    .select({ id: postMetaTable.id })
    .from(postMetaTable)
    .where(and(liveEntityWhere(postMetaTable, { asOf: now }), eq(postMetaTable.visible, true)))
    .orderBy(desc(postMetaTable.firstPublishedAt))
  const rows = limit !== undefined ? await base.limit(limit) : await base
  return rows.map((row) => row.id)
}

export async function listLiveVisiblePostMetasWithCover(
  db: Database,
  limit: number,
  now = new Date(),
): Promise<PostMetaRow[]> {
  return sqliteOf(db)
    .select()
    .from(postMetaTable)
    .where(
      and(
        liveEntityWhere(postMetaTable, { asOf: now }),
        eq(postMetaTable.visible, true),
        sql`${postMetaTable.cover} <> ''`,
      ),
    )
    .orderBy(desc(postMetaTable.firstPublishedAt))
    .limit(limit)
}

export async function listVisibleLivePostIdsOrderedById(db: Database): Promise<number[]> {
  const rows = await sqliteOf(db)
    .select({ id: postMetaTable.id })
    .from(postMetaTable)
    .where(and(liveEntityWhere(postMetaTable), eq(postMetaTable.visible, true)))
    .orderBy(asc(postMetaTable.id))
  return rows.map((row) => row.id)
}

export async function listPostMetasByIds(db: Database, ids: readonly number[]): Promise<PostMetaRow[]> {
  if (ids.length === 0) {
    return []
  }
  return sqliteOf(db)
    .select()
    .from(postMetaTable)
    .where(inArray(postMetaTable.id, [...ids]))
}

// ---------------------------------------------------------------------------
// Taxonomy aggregations
// ---------------------------------------------------------------------------

export async function listPostTitlesByTag(db: Database, name: string): Promise<string[]> {
  const rows = await sqliteOf(db)
    .select({ title: postMetaTable.title })
    .from(postMetaTable)
    .where(buildPublicPostsWhere({ tag: name, includeHidden: true, includeScheduled: true }))
    .orderBy(desc(postMetaTable.firstPublishedAt))
  return rows.map((row) => row.title)
}

export async function listPostTitlesByCategoryId(db: Database, id: number): Promise<string[]> {
  const rows = await sqliteOf(db)
    .select({ title: postMetaTable.title })
    .from(postMetaTable)
    .where(buildPublicPostsWhere({ categoryId: id, includeHidden: true, includeScheduled: true }))
    .orderBy(desc(postMetaTable.firstPublishedAt))
  return rows.map((row) => row.title)
}

export interface CountPostsByTaxonomyOptions {
  kind: 'category' | 'tag'
  gate: 'admin' | 'public'
  name?: string
  names?: readonly string[]
}

export async function countPostsByTaxonomy(
  db: Database,
  options: CountPostsByTaxonomyOptions,
): Promise<Map<string, number>> {
  const gate =
    options.gate === 'admin'
      ? liveEntityWhere(postMetaTable, { includeScheduled: true })
      : and(liveEntityWhere(postMetaTable), eq(postMetaTable.visible, true))!

  if (options.names?.length === 0) {
    return new Map()
  }

  const sdb = sqliteOf(db)
  if (options.kind === 'category') {
    const base = sdb
      .select({ name: categoryTable.name, count: sql<number>`count(${postMetaTable.id})`.mapWith(Number) })
      .from(categoryTable)
      .leftJoin(postMetaTable, and(eq(postMetaTable.categoryId, categoryTable.id), gate))
      .$dynamic()
    const narrowed =
      options.name !== undefined
        ? base.where(eq(categoryTable.name, options.name))
        : options.names !== undefined
          ? base.where(inArray(categoryTable.name, [...options.names]))
          : base
    const rows = await narrowed.groupBy(categoryTable.name)
    return new Map(rows.map((row) => [row.name, row.count]))
  }

  const base = sdb
    .select({ name: tagTable.name, count: sql<number>`count(${postMetaTable.id})`.mapWith(Number) })
    .from(tagTable)
    .leftJoin(postTag, eq(postTag.tagId, tagTable.id))
    .leftJoin(postMetaTable, and(eq(postMetaTable.id, postTag.postId), gate))
    .$dynamic()
  const narrowed =
    options.name !== undefined
      ? base.where(eq(tagTable.name, options.name))
      : options.names !== undefined
        ? base.where(inArray(tagTable.name, [...options.names]))
        : base
  const rows = await narrowed.groupBy(tagTable.name)
  return new Map(rows.map((row) => [row.name, row.count]))
}

// ---------------------------------------------------------------------------
// Scheduled publish
// ---------------------------------------------------------------------------

/**
 * The earliest future publish instant across live-gated posts and pages (scheduled publish job wake-up).
 */
export function findNextScheduledPublishAt(db: Database): Date | null {
  const sdb = sqliteOf(db)
  const now = new Date()
  const nextPost = sdb
    .select({ publishedAt: postMetaTable.publishedAt })
    .from(postMetaTable)
    .where(
      and(
        liveEntityWhere(postMetaTable, { includeScheduled: true }),
        sql`${postMetaTable.publishedAt} > ${now.getTime()}`,
      ),
    )
    .orderBy(asc(postMetaTable.publishedAt))
    .limit(1)
    .all()[0]
  const nextPage = sdb
    .select({ publishedAt: pageMetaTable.publishedAt })
    .from(pageMetaTable)
    .where(
      and(
        liveEntityWhere(pageMetaTable, { includeScheduled: true }),
        sql`${pageMetaTable.publishedAt} > ${now.getTime()}`,
      ),
    )
    .orderBy(asc(pageMetaTable.publishedAt))
    .limit(1)
    .all()[0]
  const candidates = [nextPost?.publishedAt, nextPage?.publishedAt].filter((at): at is Date => at !== undefined)
  if (candidates.length === 0) {
    return null
  }
  return new Date(Math.min(...candidates.map((at) => at.getTime())))
}

export interface LivePostReindexRow {
  id: number
  title: string
  summary: string
  publishedRevisionId: number | null
}

/**
 * One reindex batch of live posts (scheduled included) in id order, plus the total live count.
 */
export async function listLivePostReindexBatch(
  db: Database,
  offset: number,
  limit: number,
): Promise<{ rows: LivePostReindexRow[]; total: number }> {
  const sdb = sqliteOf(db)
  const liveIncludingScheduled = liveEntityWhere(postMetaTable, { includeScheduled: true })
  const rows = await sdb
    .select({
      id: postMetaTable.id,
      title: postMetaTable.title,
      summary: postMetaTable.summary,
      publishedRevisionId: postMetaTable.publishedRevisionId,
    })
    .from(postMetaTable)
    .where(liveIncludingScheduled)
    .orderBy(postMetaTable.id)
    .limit(limit)
    .offset(offset)
  const totalRows = await sdb.select({ count: count() }).from(postMetaTable).where(liveIncludingScheduled)
  return { rows, total: totalRows[0].count }
}
