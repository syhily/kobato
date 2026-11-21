import type { Database } from '@kobato/db/database'

import { post as postMetaTable } from '@kobato/db/schema/post'
import { postTag } from '@kobato/db/schema/post-tag'
import { category as categoryTable, tag as tagTable } from '@kobato/db/schema/taxonomy'
import { livePostWhere } from '@kobato/server/domains/posts/live-gate'
import { buildPublicPostsWhere } from '@kobato/server/domains/posts/repos/shared'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'

export async function listPostTitlesByTaxonomy(db: Database, name: string): Promise<string[]> {
  const where = buildPublicPostsWhere({ tag: name, includeHidden: true, includeScheduled: true })
  const rows = await db
    .select({ title: postMetaTable.title })
    .from(postMetaTable)
    .where(where)
    .orderBy(desc(postMetaTable.firstPublishedAt))
  return rows.map((row) => row.title)
}

export async function listPostTitlesByCategoryId(db: Database, id: number): Promise<string[]> {
  const where = buildPublicPostsWhere({ categoryId: id, includeHidden: true, includeScheduled: true })
  const rows = await db
    .select({ title: postMetaTable.title })
    .from(postMetaTable)
    .where(where)
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
      ? livePostWhere({ includeScheduled: true })
      : and(livePostWhere(), eq(postMetaTable.visible, true))!

  if (options.names?.length === 0) {
    return new Map()
  }

  if (options.kind === 'category') {
    const base = db
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
    const counts = new Map<string, number>()
    for (const row of rows) {
      counts.set(row.name, row.count)
    }
    return counts
  }

  const base = db
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
  const counts = new Map<string, number>()
  for (const row of rows) {
    counts.set(row.name, row.count)
  }
  return counts
}
