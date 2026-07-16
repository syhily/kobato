import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, desc, inArray, isNull } from 'drizzle-orm'

import type { Post, PostVisibilityOptions } from '@/shared/types/catalog'

import { isLive, liveContentWhere } from '@/server/domains/content/schema'
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
 * Sitemap-only projection of published posts. Applies the shared live
 * gate (`liveContentWhere`) — every published, non-deleted row with a
 * published revision whose `published_at` is not in the future — but
 * selects only `slug` + `firstPublishedAt` + `publishedAt` to avoid the
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
      liveContentWhere(
        {
          deletedAt: postMetaTable.deletedAt,
          published: postMetaTable.published,
          publishedRevisionId: postMetaTable.publishedRevisionId,
          publishedAt: postMetaTable.publishedAt,
        },
        { asOf: now },
      ),
    )
    .orderBy(desc(postMetaTable.firstPublishedAt))
}

/**
 * Hydrates posts by slug. Rows come back in the caller's slug order — the
 * search pipeline passes a relevance-ranked list, so the DB result must not
 * be re-ordered by date.
 */
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

  const now = new Date()
  const filteredRows = rows.filter((meta) => {
    const visible = filters.includeHidden || meta.visible
    // Mirror the canonical live gate (content/schema.ts). `includeScheduled`
    // relaxes only the publishedAt<=now leg — a row without a promoted
    // revision is never public, scheduled or not.
    const live = filters.includeScheduled ? meta.published && meta.publishedRevisionId !== null : isLive(meta, now)
    return visible && live
  })
  const order = new Map(slugs.map((slug, index) => [slug, index]))
  filteredRows.sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0))
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
