import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, desc, inArray, isNull } from 'drizzle-orm'

import type { Post, PostVisibilityOptions } from '@/shared/types/catalog'

import { buildPublicPostFilters, hydratePostImages } from '@/server/domains/posts/repos/hydrate'
import { listPublicPosts } from '@/server/domains/posts/repos/public-query/listing'
import { toPostFromMeta } from '@/server/domains/posts/repos/single'
import { findTagNamesByPostIds } from '@/server/infra/db/operations/post-tag'
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
  const filteredRows = rows.filter((meta) => {
    const visible = filters.includeHidden || meta.visible
    const published = filters.includeScheduled || meta.publishedAt <= now
    return visible && published && meta.published
  })
  const tagMap = await findTagNamesByPostIds(
    db,
    filteredRows.map((m) => m.id),
  )
  const posts = filteredRows.map((meta) => toPostFromMeta(meta, tagMap.get(meta.id) ?? []))
  await hydratePostImages(db, posts)
  return posts
}

export async function listAllPosts(db: NodePgDatabase, options?: PostVisibilityOptions): Promise<Post[]> {
  const filters = buildPublicPostFilters(options)
  const metas = await listPublicPosts(db, { ...filters })
  const tagMap = await findTagNamesByPostIds(
    db,
    metas.map((m) => m.id),
  )
  const posts = metas.map((meta) => toPostFromMeta(meta, tagMap.get(meta.id) ?? []))
  await hydratePostImages(db, posts)
  return posts
}
