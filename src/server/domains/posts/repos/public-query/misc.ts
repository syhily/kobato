import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, desc, inArray, isNull } from 'drizzle-orm'

import type { Post, PostVisibilityOptions } from '@/shared/types/catalog'

import { buildPublicPostFilters, hydratePostImages } from '@/server/domains/posts/repos/hydrate'
import { listPublicPosts } from '@/server/domains/posts/repos/public-query/listing'
import { toPostFromMeta } from '@/server/domains/posts/repos/single'
import { post as postMetaTable } from '@/server/infra/db/schema/post'

export async function getPostsBySlugs(
  db: NodePgDatabase,
  slugs: readonly string[],
  options?: PostVisibilityOptions,
): Promise<Post[]> {
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
  await hydratePostImages(db, posts)
  return posts
}

export async function listAllPosts(db: NodePgDatabase, options?: PostVisibilityOptions): Promise<Post[]> {
  const filters = buildPublicPostFilters(options)
  const metas = await listPublicPosts(db, { ...filters })
  const posts = metas.map((meta) => toPostFromMeta(meta))
  await hydratePostImages(db, posts)
  return posts
}
