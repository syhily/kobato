import type { Database } from '@kobato/db/sqlite/database'
import type { AnyMetaRow } from '@kobato/db/sqlite/operations/content/entity-meta'
import type { PageMetaRow, PostMetaRow } from '@kobato/db/sqlite/types'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { likeEscape } from '@kobato/db/sqlite/like-escape'
import { promotedEntityWhere } from '@kobato/db/sqlite/operations/content/entity-meta'
import { page as pageMetaTable } from '@kobato/db/sqlite/schema/page'
import { post as postMetaTable } from '@kobato/db/sqlite/schema/post'
import { postTag } from '@kobato/db/sqlite/schema/post-tag'
import { tag as tagTable } from '@kobato/db/sqlite/schema/taxonomy'
import { user } from '@kobato/db/sqlite/schema/user'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { and, asc, desc, eq, getColumns, isNotNull, isNull, not, or, sql, type SQL } from 'drizzle-orm'

export interface EntityListFiltersBase {
  q?: string
  deletedStatus?: 'all' | 'deleted' | 'normal'
  published?: boolean
  authorId?: number
  limit?: number
  offset?: number
}

export interface PostListFilters extends EntityListFiltersBase {
  categoryId?: number
  tag?: string
  visible?: boolean
  sortBy?: 'publishedAt' | 'updatedAt'
  sortOrder?: 'asc' | 'desc'
  lifecycle?: 'draft' | 'published'
}

function tagMembershipCondition(tagName: string): SQL {
  return sql`EXISTS (
    SELECT 1 FROM ${postTag}
    INNER JOIN ${tagTable} ON ${eq(postTag.tagId, tagTable.id)}
    WHERE ${eq(postTag.postId, postMetaTable.id)} AND ${eq(tagTable.name, tagName)}
  )`
}

function buildBaseListWhere(
  table: typeof postMetaTable | typeof pageMetaTable,
  filters: EntityListFiltersBase,
  extras: SQL[],
): SQL | undefined {
  const conditions: SQL[] = []
  if (filters.deletedStatus === 'deleted') {
    conditions.push(isNotNull(table.deletedAt))
  } else if (filters.deletedStatus === 'normal') {
    conditions.push(isNull(table.deletedAt))
  }
  if (filters.q && filters.q.trim() !== '') {
    const search = or(likeEscape(table.slug, filters.q.trim()), likeEscape(table.title, filters.q.trim()))
    if (search) {
      conditions.push(search)
    }
  }
  if (filters.published !== undefined) {
    conditions.push(eq(table.published, filters.published))
  }
  if (filters.authorId !== undefined) {
    conditions.push(eq(table.authorId, filters.authorId))
  }
  conditions.push(...extras)
  if (conditions.length === 0) {
    return undefined
  }
  if (conditions.length === 1) {
    return conditions[0]
  }
  return and(...conditions)
}

function buildPostListWhere(filters: PostListFilters): SQL | undefined {
  const extras: SQL[] = []
  if (filters.categoryId !== undefined) {
    extras.push(eq(postMetaTable.categoryId, filters.categoryId))
  }
  if (filters.tag) {
    extras.push(tagMembershipCondition(filters.tag))
  }
  if (filters.visible !== undefined) {
    extras.push(eq(postMetaTable.visible, filters.visible))
  }
  if (filters.lifecycle === 'published') {
    extras.push(promotedEntityWhere(postMetaTable))
  } else if (filters.lifecycle === 'draft') {
    const notPromoted = not(promotedEntityWhere(postMetaTable))
    if (notPromoted) {
      extras.push(notPromoted)
    }
  }
  return buildBaseListWhere(postMetaTable, filters, extras)
}

async function listEntityMetasWhere(
  db: Database,
  table: typeof postMetaTable | typeof pageMetaTable,
  where: SQL | undefined,
  orderBy: SQL,
  filters: EntityListFiltersBase,
): Promise<(AnyMetaRow & { authorName: string | null })[]> {
  const base = sqliteOf(db)
    .select({ ...getColumns(table), authorName: user.name })
    .from(table)
    .leftJoin(user, eq(user.id, table.authorId))
    .orderBy(orderBy)
  const query = where ? base.where(where) : base
  if (filters.limit !== undefined) {
    if (filters.offset !== undefined && filters.offset > 0) {
      return query.limit(filters.limit).offset(filters.offset)
    }
    return query.limit(filters.limit)
  }
  if (filters.offset !== undefined && filters.offset > 0) {
    return query.offset(filters.offset)
  }
  return query
}

async function countEntityMetasWhere(
  db: Database,
  table: typeof postMetaTable | typeof pageMetaTable,
  where: SQL | undefined,
): Promise<number> {
  const rows = await sqliteOf(db)
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(table)
    .where(where)
  return rows[0]?.count ?? 0
}

export async function listPostMetas(
  db: Database,
  filters: PostListFilters,
): Promise<(PostMetaRow & { authorName: string | null })[]> {
  const col = filters.sortBy === 'updatedAt' ? postMetaTable.updatedAt : postMetaTable.firstPublishedAt
  const orderBy = filters.sortOrder === 'asc' ? asc(col) : desc(col)
  return unsafeCast<(PostMetaRow & { authorName: string | null })[]>(
    await listEntityMetasWhere(db, postMetaTable, buildPostListWhere(filters), orderBy, filters),
  )
}

export async function countPostMetas(db: Database, filters: PostListFilters): Promise<number> {
  return countEntityMetasWhere(db, postMetaTable, buildPostListWhere(filters))
}

export async function listPageMetas(
  db: Database,
  filters: EntityListFiltersBase,
): Promise<(PageMetaRow & { authorName: string | null })[]> {
  return unsafeCast<(PageMetaRow & { authorName: string | null })[]>(
    await listEntityMetasWhere(
      db,
      pageMetaTable,
      buildBaseListWhere(pageMetaTable, filters, []),
      desc(pageMetaTable.updatedAt),
      filters,
    ),
  )
}

export async function countPageMetas(db: Database, filters: EntityListFiltersBase): Promise<number> {
  return countEntityMetasWhere(db, pageMetaTable, buildBaseListWhere(pageMetaTable, filters, []))
}
