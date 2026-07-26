import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, desc, eq, isNull } from 'drizzle-orm'

import type { NewPageMeta, PageMetaRow } from '@/server/infra/db/types'
import type { Page } from '@/shared/types/catalog'

import { makeMetaCrud } from '@/server/domains/content/entities/meta-repo'
import { findContentById, hydratePublishedRevisions } from '@/server/domains/content/revisions'
import { isLive } from '@/server/domains/content/schemas/live-gate'
import { hydrateImageRefs } from '@/server/domains/images/services/enhance'
import { livePageWhere } from '@/server/domains/pages/live-gate'
import { toCmsPage } from '@/server/domains/pages/projection'
import { page as pageMetaTable } from '@/server/infra/db/schema/page'

const crud = makeMetaCrud<PageMetaRow, NewPageMeta>(pageMetaTable)

/**
 * Slug-keyed lookup that **excludes** soft-deleted rows. Used by the
 * public catalog where deleted pages should 404 even if they share a
 * slug with a future restoration target. Scheduled pages (rows with
 * `published_at > now()`) are NOT filtered here because the catalog
 * caller is the only place where the visibility check belongs;
 * keeping the row reachable from the admin path through this same
 * helper would force a parallel "include scheduled" boolean. The
 * catalog applies the timestamp gate in the service layer instead.
 */
export const findPublicPageMetaBySlug = crud.findPublicMetaBySlug

/** All non-deleted page meta rows; cataloged at startup. */
export async function listPublicPageMetas(db: NodePgDatabase, limit = 500): Promise<PageMetaRow[]> {
  return db
    .select()
    .from(pageMetaTable)
    .where(isNull(pageMetaTable.deletedAt))
    .orderBy(desc(pageMetaTable.firstPublishedAt))
    .limit(limit)
}

/**
 * Slim live-by-slug lookup — id + title only, gated by `livePageWhere`.
 * Cross-domain consumers that must know whether a slug resolves to a live
 * page (webmention target resolution) mount this instead of opening a
 * page-table query of their own.
 */
export async function findLivePageBySlug(
  db: NodePgDatabase,
  slug: string,
): Promise<{ id: bigint; title: string } | null> {
  const rows = await db
    .select({ id: pageMetaTable.id, title: pageMetaTable.title })
    .from(pageMetaTable)
    .where(and(eq(pageMetaTable.slug, slug), livePageWhere()))
    .limit(1)
  return rows[0] ?? null
}

/** Slim row for sitemap generation — only the fields needed to derive `permalink` + `lastmod`. */
export interface SitemapPageRow {
  slug: string
  firstPublishedAt: Date | null
  publishedAt: Date
}

/**
 * Sitemap-only projection of published pages. Applies the SQL
 * projection of the live gate (`livePageWhere`, the page-table dual of
 * `isLive` used inside `listAllPages`) — not deleted, published, has a
 * published revision, `published_at` not in the future — but selects
 * only `slug` + `firstPublishedAt` + `publishedAt` to skip the
 * revision-join + image-hydration the full `listAllPages` path
 * performs.
 */
export async function listSitemapPages(db: NodePgDatabase, now = new Date()): Promise<SitemapPageRow[]> {
  return db
    .select({
      slug: pageMetaTable.slug,
      firstPublishedAt: pageMetaTable.firstPublishedAt,
      publishedAt: pageMetaTable.publishedAt,
    })
    .from(pageMetaTable)
    .where(livePageWhere({ asOf: now }))
    .orderBy(desc(pageMetaTable.firstPublishedAt))
}

async function hydratePageImages(db: NodePgDatabase, pages: Page[]): Promise<void> {
  await hydrateImageRefs(
    db,
    pages,
    (p) => p.cover,
    (p, lookup) => {
      p.coverThumbhash = lookup?.thumbhash
      p.coverWidth = lookup?.width
      p.coverHeight = lookup?.height
      if (lookup?.publicUrl != null) {
        p.cover = lookup.publicUrl
      }
    },
  )
}

export async function findPageBySlug(db: NodePgDatabase, slug: string): Promise<Page | null> {
  const meta = await findPublicPageMetaBySlug(db, slug)
  if (meta === null || !isLive(meta)) {
    return null
  }
  const revision = meta.publishedRevisionId === null ? null : await findContentById(db, meta.publishedRevisionId)
  // `toCmsPage` already returns the shared `Page` DTO — no promotion step.
  const page = toCmsPage(meta, revision)
  await hydratePageImages(db, [page])
  return page
}

export async function listAllPages(db: NodePgDatabase): Promise<Page[]> {
  const metas = await listPublicPageMetas(db)
  const asOf = new Date()
  const visible = metas.filter((meta) => isLive(meta, { asOf }))
  if (visible.length === 0) {
    return []
  }

  const revisionMap = await hydratePublishedRevisions(db, visible)
  const pages = visible.map((meta) => {
    const revision = meta.publishedRevisionId === null ? null : (revisionMap.get(meta.publishedRevisionId) ?? null)
    return toCmsPage(meta, revision)
  })
  await hydratePageImages(db, pages)
  return pages
}
