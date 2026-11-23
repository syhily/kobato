import type { Database } from '@kobato/db/sqlite/database'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { liveEntityWhere } from '@kobato/db/sqlite/operations/content/entity-meta'
import { buildPublicPostsWhere } from '@kobato/db/sqlite/operations/content/post'
import { post as postMetaTable } from '@kobato/db/sqlite/schema/post'
import { postTag } from '@kobato/db/sqlite/schema/post-tag'
import { category as categoryTable, tag as tagTable } from '@kobato/db/sqlite/schema/taxonomy'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'

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
