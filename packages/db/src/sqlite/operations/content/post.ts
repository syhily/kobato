import type { Database } from '@kobato/db/sqlite/database'
import type { ContentRow, PostMetaRow } from '@kobato/db/sqlite/types'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { liveEntityWhere } from '@kobato/db/sqlite/operations/content/entity-meta'
import { content as contentTable } from '@kobato/db/sqlite/schema/content'
import { post as postMetaTable } from '@kobato/db/sqlite/schema/post'
import { postTag } from '@kobato/db/sqlite/schema/post-tag'
import { tag as tagTable } from '@kobato/db/sqlite/schema/taxonomy'
import { and, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm'

export interface PublicPostFilters {
  categoryId?: number
  tag?: string
  includeHidden?: boolean
  includeScheduled?: boolean
  sortBy?: 'publishedAt' | 'updatedAt'
  limit?: number
  offset?: number
}

export function buildPublicPostsWhere(filters: PublicPostFilters, now = new Date()): SQL {
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
