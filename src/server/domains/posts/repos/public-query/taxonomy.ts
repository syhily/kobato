import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { Post, PostVisibilityOptions } from '@/shared/types/catalog'

import { buildPublicPostFilters, hydratePostImages } from '@/server/domains/posts/repos/hydrate'
import { listPublicPosts } from '@/server/domains/posts/repos/public-query/listing'
import { toPostFromMeta } from '@/server/domains/posts/repos/single'
import { findTagNamesByPostIds } from '@/server/infra/db/operations/post-tag'

export async function listPostsByCategory(
  db: NodePgDatabase,
  category: string,
  options?: PostVisibilityOptions,
): Promise<Post[]> {
  const filters = buildPublicPostFilters(options)
  const metas = await listPublicPosts(db, { ...filters, category })
  const tagMap = await findTagNamesByPostIds(
    db,
    metas.map((m) => m.id),
  )
  const posts = metas.map((meta) => toPostFromMeta(meta, tagMap.get(meta.id) ?? []))
  await hydratePostImages(db, posts)
  return posts
}

export async function listPostsByTag(
  db: NodePgDatabase,
  tag: string,
  options?: PostVisibilityOptions,
): Promise<Post[]> {
  const filters = buildPublicPostFilters(options)
  const metas = await listPublicPosts(db, { ...filters, tag })
  const tagMap = await findTagNamesByPostIds(
    db,
    metas.map((m) => m.id),
  )
  const posts = metas.map((meta) => toPostFromMeta(meta, tagMap.get(meta.id) ?? []))
  await hydratePostImages(db, posts)
  return posts
}
