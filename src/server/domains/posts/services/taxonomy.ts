import { and, desc, eq, inArray, sql } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { Post, PostVisibilityOptions } from '@/shared/types/catalog'

import { livePostWhere } from '@/server/domains/posts/live-gate'
import { buildPublicPostFilters, hydratePostList } from '@/server/domains/posts/repos/hydrate'
import { buildPublicPostsWhere } from '@/server/domains/posts/repos/shared'
import { listPublicPosts } from '@/server/domains/posts/services/public-query'
import { findCategoryByName } from '@/server/infra/db/operations/category'
import { post as postMetaTable } from '@/server/infra/db/schema/post'
import { postTag } from '@/server/infra/db/schema/post-tag'
import { category as categoryTable, tag as tagTable } from '@/server/infra/db/schema/taxonomy'

/**
 * Category and tag listings differ only in the filter key — one function
 * takes the `kind`; the category branch resolves the name to its row first.
 */
export async function listPostsByTaxonomy(
  db: Database,
  kind: 'category' | 'tag',
  name: string,
  options?: PostVisibilityOptions,
): Promise<Post[]> {
  const filters = buildPublicPostFilters(options)
  if (kind === 'category') {
    const row = await findCategoryByName(db, name)
    if (row === null) {
      return []
    }
    const metas = await listPublicPosts(db, { ...filters, categoryId: row.id })
    return hydratePostList(db, metas)
  }
  const metas = await listPublicPosts(db, { ...filters, tag: name })
  return hydratePostList(db, metas)
}

/**
 * Title-only lookup for the taxonomy delete guard: full-inclusion gate
 * (every live-ish reference blocks deletion), no hydration.
 */
export async function listPostTitlesByTaxonomy(db: Database, kind: 'tag', name: string): Promise<string[]> {
  const where = buildPublicPostsWhere({ tag: name, includeHidden: true, includeScheduled: true })
  const rows = await db
    .select({ title: postMetaTable.title })
    .from(postMetaTable)
    .where(where)
    .orderBy(desc(postMetaTable.firstPublishedAt))
  return rows.map((row) => row.title)
}

/**
 * Category counterpart of {@link listPostTitlesByTaxonomy}, keyed by row id.
 */
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
  /** `admin` counts live posts incl. scheduled; `public` counts live AND `visible`. */
  gate: 'admin' | 'public'
  /** Narrow the count to a single taxonomy term (e.g. the just-upserted row). */
  name?: string
  /** Narrow the count to a set of terms (e.g. the tag names a page renders). */
  names?: readonly string[]
}

/**
 * Single implementation behind every per-term post count; both gates
 * delegate to `livePostWhere`. Terms with no posts are absent (callers default 0).
 */
export async function countPostsByTaxonomy(
  db: Database,
  options: CountPostsByTaxonomyOptions,
): Promise<Map<string, number>> {
  const gate =
    options.gate === 'admin'
      ? livePostWhere({ includeScheduled: true })
      : and(livePostWhere(), eq(postMetaTable.visible, true))!

  if (options.names !== undefined && options.names.length === 0) {
    return new Map()
  }

  if (options.kind === 'category') {
    const base = db
      .select({ name: categoryTable.name, count: sql<number>`count(${postMetaTable.id})` })
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
    .select({ name: tagTable.name, count: sql<number>`count(${postMetaTable.id})` })
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
