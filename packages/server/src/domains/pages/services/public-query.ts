import type { Page } from '@kobato/catalog/model.ts'
import type { Database } from '@kobato/db/database.ts'
import type { NewPageMeta, PageMetaRow } from '@kobato/db/types.ts'

import { page as pageMetaTable } from '@kobato/db/schema/page.ts'
import { makeMetaCrud } from '@kobato/server/domains/content/entities/meta-repo.ts'
import { findContentById } from '@kobato/server/domains/content/revisions.ts'
import { isLive } from '@kobato/server/domains/content/schemas/live-gate.ts'
import { hydrateImageRefs } from '@kobato/server/domains/images/services/enhance.ts'
import { livePageWhere } from '@kobato/server/domains/pages/live-gate.ts'
import { toCmsPage } from '@kobato/server/domains/pages/projection.ts'
import { and, desc, eq } from 'drizzle-orm'

const crud = makeMetaCrud<PageMetaRow, NewPageMeta>(pageMetaTable)

export const findPublicPageMetaBySlug = crud.findPublicMetaBySlug

export async function findLivePageBySlug(db: Database, slug: string): Promise<{ id: number; title: string } | null> {
  const rows = await db
    .select({ id: pageMetaTable.id, title: pageMetaTable.title })
    .from(pageMetaTable)
    .where(and(eq(pageMetaTable.slug, slug), livePageWhere()))
    .limit(1)
  return rows[0] ?? null
}

interface SitemapPageRow {
  slug: string
  firstPublishedAt: Date | null
  publishedAt: Date
}

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
  const page = toCmsPage(meta, revision)
  await hydratePageImages(db, [page])
  return page
}
