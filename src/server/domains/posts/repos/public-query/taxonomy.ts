import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { desc } from 'drizzle-orm'

import type { Post, PostVisibilityOptions } from '@/shared/types/catalog'

import { buildPublicPostFilters, hydratePostList } from '@/server/domains/posts/repos/hydrate'
import { listPublicPosts } from '@/server/domains/posts/repos/public-query/listing'
import { buildPublicPostsWhere } from '@/server/domains/posts/repos/shared'
import { post as postMetaTable } from '@/server/infra/db/schema/post'

/**
 * Posts referencing one taxonomy term. Category and tag listings differ
 * only in the filter key, so a single function takes the `kind`.
 */
export async function listPostsByTaxonomy(
  db: NodePgDatabase,
  kind: 'category' | 'tag',
  name: string,
  options?: PostVisibilityOptions,
): Promise<Post[]> {
  const filters = buildPublicPostFilters(options)
  const metas = await listPublicPosts(db, {
    ...filters,
    ...(kind === 'category' ? { category: name } : { tag: name }),
  })
  return hydratePostList(db, metas)
}

/**
 * Slim seam for the taxonomy delete guard: just the titles of posts that
 * still reference the term, under the guard's full-inclusion gate (hidden
 * + scheduled included — every live-ish reference blocks deletion).
 * Selects only `title`: no tag batch, no revision join, no cover/thumbhash
 * hydration — the 409 message needs nothing else.
 */
export async function listPostTitlesByTaxonomy(
  db: NodePgDatabase,
  kind: 'category' | 'tag',
  name: string,
): Promise<string[]> {
  const where = buildPublicPostsWhere(
    kind === 'category'
      ? { category: name, includeHidden: true, includeScheduled: true }
      : { tag: name, includeHidden: true, includeScheduled: true },
  )
  const rows = await db
    .select({ title: postMetaTable.title })
    .from(postMetaTable)
    .where(where)
    .orderBy(desc(postMetaTable.firstPublishedAt))
  return rows.map((row) => row.title)
}
