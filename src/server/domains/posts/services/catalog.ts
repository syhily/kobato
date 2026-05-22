import type { ContentRow } from '@/server/infra/db/types'

import { isCatalogVisible } from '@/server/domains/content/schema'
import { toCmsPost, type CmsPost } from '@/server/domains/posts/projection'
import {
  findContentById,
  findContentsByIds,
  findPublicPostMetaBySlug,
  listPublicPostMetas,
} from '@/server/domains/posts/repo'
import { postMetaCache } from '@/server/domains/posts/services/shared'
import { requireBlogSettingsSection } from '@/shared/config/blog'

export async function loadCatalogPostMetas(): Promise<CmsPost[]> {
  const cached = await postMetaCache.get()
  if (cached !== null) {
    return cached.map((p) => ({ ...p }))
  }

  const contentSettings = requireBlogSettingsSection('content')
  const sortBy = contentSettings.post.sortBy ?? 'publishedAt'
  const metas = await listPublicPostMetas(sortBy)
  const asOf = new Date()
  const visible = metas.filter((meta) => isCatalogVisible(meta, asOf))
  if (visible.length === 0) {
    return []
  }
  const revisionIds = visible.map((m) => m.publishedRevisionId).filter((id): id is bigint => id !== null)
  const revisionMap = new Map<bigint, ContentRow>()
  if (revisionIds.length > 0) {
    const rows = await findContentsByIds(revisionIds)
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

export async function loadCatalogPostBySlug(slug: string): Promise<CmsPost | null> {
  const meta = await findPublicPostMetaBySlug(slug)
  if (meta === null || !isCatalogVisible(meta)) {
    return null
  }
  const revision = meta.publishedRevisionId === null ? null : await findContentById(meta.publishedRevisionId)
  return toCmsPost(meta, revision)
}
