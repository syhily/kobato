import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'

import type { Post, PostVisibilityOptions } from '@/shared/types/catalog'

import { buildPublicPostFilters, hydratePostImages } from '@/server/domains/posts/repos/hydrate'
import { listPublicPosts } from '@/server/domains/posts/repos/public-query/listing'
import { toPostFromMeta } from '@/server/domains/posts/repos/single'
import { findTagNamesByPostIds } from '@/server/infra/db/operations/post-tag'
import { post as postMetaTable } from '@/server/infra/db/schema/post'

/** Slim row for sitemap generation — only the fields needed to derive `permalink` + `lastmod`. */
export interface SitemapPostRow {
  slug: string
  firstPublishedAt: Date | null
  publishedAt: Date
}

/**
 * Sitemap-only projection of published posts. Mirrors the visibility
 * gate used by `listAllPosts({ includeHidden: true, includeScheduled:
 * false })` — i.e. every published, non-deleted row with a published
 * revision whose `published_at` is not in the future — but selects
 * only `slug` + `firstPublishedAt` + `publishedAt` to avoid the
 * revision-join + image-hydration fan-out the full `listAllPosts`
 * path performs.
 */
export async function listSitemapPosts(db: NodePgDatabase, now = new Date()): Promise<SitemapPostRow[]> {
  return db
    .select({
      slug: postMetaTable.slug,
      firstPublishedAt: postMetaTable.firstPublishedAt,
      publishedAt: postMetaTable.publishedAt,
    })
    .from(postMetaTable)
    .where(
      and(
        isNull(postMetaTable.deletedAt),
        eq(postMetaTable.published, true),
        isNotNull(postMetaTable.publishedRevisionId),
        sql`${postMetaTable.publishedAt} <= ${now}`,
      ),
    )
    .orderBy(desc(postMetaTable.firstPublishedAt))
}

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
