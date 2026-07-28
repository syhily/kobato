import { and, desc, eq, isNull } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
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
 * Slug-keyed lookup that **excludes** soft-deleted rows. Scheduled pages
 * (`published_at > now()`) are NOT filtered here — the catalog service
 * layer applies the timestamp gate instead.
 */
export const findPublicPageMetaBySlug = crud.findPublicMetaBySlug

/** All non-deleted page meta rows; cataloged at startup. */
export async function listPublicPageMetas(db: Database, limit = 500): Promise<PageMetaRow[]> {
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
export async function findLivePageBySlug(db: Database, slug: string): Promise<{ id: number; title: string } | null> {
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
 * Sitemap-only projection of published pages: live-gated via
 * `livePageWhere`, selecting only the columns the sitemap needs so it
 * skips the revision-join + image-hydration of the full `listAllPages`.
 */
export async function listSitemapPages(db: Database, now = new Date()): Promise<SitemapPageRow[]> {
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

async function hydratePageImages(db: Database, pages: Page[]): Promise<void> {
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

export async function findPageBySlug(db: Database, slug: string): Promise<Page | null> {
  const meta = findPublicPageMetaBySlug(db, slug)
  if (meta === null || !isLive(meta)) {
    return null
  }
  const revision = meta.publishedRevisionId === null ? null : findContentById(db, meta.publishedRevisionId)
  // `toCmsPage` already returns the shared `Page` DTO — no promotion step.
  const page = toCmsPage(meta, revision)
  await hydratePageImages(db, [page])
  return page
}

export async function listAllPages(db: Database): Promise<Page[]> {
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
