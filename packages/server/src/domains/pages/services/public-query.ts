import type { Page } from '@kobato/catalog/model'
import type { Database } from '@kobato/db/database'
import type { PageMetaRow } from '@kobato/db/types'

import { findPublicEntityMetaBySlug } from '@kobato/db/operations/entity-meta'
import { findContentById } from '@kobato/db/operations/entity-revision'
import {
  findLivePageBySlug as findLivePageBySlugOp,
  listSitemapPages as listSitemapPagesOp,
  type SitemapPageRow,
} from '@kobato/db/operations/page'
import { isLive } from '@kobato/server/domains/content/schemas/live-gate'
import { hydrateImageRefs } from '@kobato/server/domains/images/services/enhance'
import { toCmsPage } from '@kobato/server/domains/pages/projection'
import { unsafeCast } from '@kobato/utils/unsafe-cast'

export const findPublicPageMetaBySlug = (db: Database, slug: string): PageMetaRow | null =>
  unsafeCast<PageMetaRow | null>(findPublicEntityMetaBySlug(db, 'page', slug))

export async function findLivePageBySlug(db: Database, slug: string): Promise<{ id: number; title: string } | null> {
  return findLivePageBySlugOp(db, slug)
}

export async function listSitemapPages(db: Database, now = new Date()): Promise<SitemapPageRow[]> {
  return listSitemapPagesOp(db, now)
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
