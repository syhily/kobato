import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { ContentRow } from '@/server/infra/db/types'

import { findContentById, findContentsByIds } from '@/server/domains/content/repos/query'
import { isCatalogVisible } from '@/server/domains/content/schema'
import { toCmsPage, type CmsPage } from '@/server/domains/pages/projection'
import { findPublicPageMetaBySlug, listPublicPageMetas } from '@/server/domains/pages/repo'
import { pagesCache } from '@/server/domains/pages/services/shared'

/** All non-deleted, non-scheduled, published pages joined with their content. */
export async function loadCatalogPages(db: NodePgDatabase): Promise<CmsPage[]> {
  const cached = await pagesCache.get()
  if (cached !== null) {
    return cached.map((p) => ({ ...p }))
  }
  const metas = await listPublicPageMetas(db)
  const asOf = new Date()
  const visible = metas.filter((meta) => isCatalogVisible(meta, asOf))
  if (visible.length === 0) {
    await pagesCache.set([])
    return []
  }
  const revisionIds = visible.map((m) => m.publishedRevisionId).filter((id): id is bigint => id !== null)
  const revisionMap = new Map<bigint, ContentRow>()
  if (revisionIds.length > 0) {
    const rows = await findContentsByIds(db, revisionIds)
    for (const row of rows) {
      revisionMap.set(row.id, row)
    }
  }
  const result = visible.map((meta) => {
    const revision = meta.publishedRevisionId === null ? null : (revisionMap.get(meta.publishedRevisionId) ?? null)
    return toCmsPage(meta, revision)
  })
  await pagesCache.set(result)
  return result.map((p) => ({ ...p }))
}

/**
 * Single-page lookup for the public detail route. Returns `null` when
 * the slug is unknown, soft-deleted, taken offline, or scheduled for
 * the future. Soft-deleted pages 404; pages with `status=draft`
 * on the meta row also 404 — same semantics as MDX `published` on posts.
 * Scheduled (future-dated) pages 404 too so the catalog stays consistent
 * with `loadCatalogPages()`.
 */
export async function loadCatalogPageBySlug(db: NodePgDatabase, slug: string): Promise<CmsPage | null> {
  const meta = await findPublicPageMetaBySlug(db, slug)
  if (meta === null || !isCatalogVisible(meta)) {
    return null
  }
  const revision = meta.publishedRevisionId === null ? null : await findContentById(db, meta.publishedRevisionId)
  return toCmsPage(meta, revision)
}
