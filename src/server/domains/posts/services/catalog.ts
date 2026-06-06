import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { ContentRow } from '@/server/infra/db/types'

import { findContentById, findContentsByIds } from '@/server/domains/content/repos/query'
import { isCatalogVisible } from '@/server/domains/content/schema'
import { toCmsPost, type CmsPost } from '@/server/domains/posts/projection'
import { listPublicPostMetas } from '@/server/domains/posts/repos/public-query/listing'
import { findPublicPostMetaBySlug } from '@/server/domains/posts/repos/single'
import { postMetaCache } from '@/server/domains/posts/services/shared'
import { requireBlogSettingsSection } from '@/shared/config/getters'

export async function loadCatalogPostMetas(db: NodePgDatabase): Promise<CmsPost[]> {
  const cached = await postMetaCache.get()
  if (cached !== null) {
    return cached.map((p) => ({ ...p }))
  }

  const contentSettings = requireBlogSettingsSection('content')
  const sortBy = contentSettings.post.sortBy ?? 'publishedAt'
  const metas = await listPublicPostMetas(db, sortBy)
  const asOf = new Date()
  const visible = metas.filter((meta) => isCatalogVisible(meta, asOf))
  if (visible.length === 0) {
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
    return toCmsPost(meta, revision)
  })

  await postMetaCache.set(result)
  return result.map((p) => ({ ...p }))
}

export async function loadCatalogPostBySlug(db: NodePgDatabase, slug: string): Promise<CmsPost | null> {
  const meta = await findPublicPostMetaBySlug(db, slug)
  if (meta === null || !isCatalogVisible(meta)) {
    return null
  }
  const revision = meta.publishedRevisionId === null ? null : await findContentById(db, meta.publishedRevisionId)
  return toCmsPost(meta, revision)
}
