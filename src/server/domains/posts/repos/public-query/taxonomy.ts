import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { Post, PostVisibilityOptions } from '@/shared/types/catalog'

import { buildPublicPostFilters, hydratePostImages } from '@/server/domains/posts/repos/hydrate'
import { listPublicPosts } from '@/server/domains/posts/repos/public-query/listing'
import { toPostFromMeta } from '@/server/domains/posts/repos/single'

export async function listPostsByCategory(
  db: NodePgDatabase,
  category: string,
  options?: PostVisibilityOptions,
): Promise<Post[]> {
  const filters = buildPublicPostFilters(options)
  const metas = await listPublicPosts(db, { ...filters, category })
  const posts = metas.map((meta) => toPostFromMeta(meta))
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
  const posts = metas.map((meta) => toPostFromMeta(meta))
  await hydratePostImages(db, posts)
  return posts
}
