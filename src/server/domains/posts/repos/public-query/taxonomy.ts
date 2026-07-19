import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { desc } from 'drizzle-orm'

import type { Post, PostVisibilityOptions } from '@/shared/types/catalog'

import { buildPublicPostFilters, hydratePostList } from '@/server/domains/posts/repos/hydrate'
import { listPublicPosts } from '@/server/domains/posts/repos/public-query/listing'
import { buildPublicPostsWhere } from '@/server/domains/posts/repos/shared'
import { findCategoryByName } from '@/server/infra/db/operations/category'
import { post as postMetaTable } from '@/server/infra/db/schema/post'

/**
 * Posts referencing one taxonomy term. Category and tag listings differ
 * only in the filter key, so a single function takes the `kind`. The
 * category branch resolves the display name to its row first — posts
 * reference categories by id.
 */
export async function listPostsByTaxonomy(
  db: NodePgDatabase,
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
 * Slim seam for the taxonomy delete guard: just the titles of posts that
 * still reference the tag, under the guard's full-inclusion gate (hidden
 * + scheduled included — every live-ish reference blocks deletion).
 * Selects only `title`: no tag batch, no revision join, no cover/thumbhash
 * hydration — the 409 message needs nothing else.
 */
export async function listPostTitlesByTaxonomy(db: NodePgDatabase, kind: 'tag', name: string): Promise<string[]> {
  const where = buildPublicPostsWhere({ tag: name, includeHidden: true, includeScheduled: true })
  const rows = await db
    .select({ title: postMetaTable.title })
    .from(postMetaTable)
    .where(where)
    .orderBy(desc(postMetaTable.firstPublishedAt))
  return rows.map((row) => row.title)
}

/**
 * The category counterpart of {@link listPostTitlesByTaxonomy}: same slim
 * title-only shape and full-inclusion gate, keyed by the category row id
 * posts reference.
 */
export async function listPostTitlesByCategoryId(db: NodePgDatabase, id: bigint): Promise<string[]> {
  const where = buildPublicPostsWhere({ categoryId: id, includeHidden: true, includeScheduled: true })
  const rows = await db
    .select({ title: postMetaTable.title })
    .from(postMetaTable)
    .where(where)
    .orderBy(desc(postMetaTable.firstPublishedAt))
  return rows.map((row) => row.title)
}
