import type { OgWarmTarget } from '@/server/domains/content/render-warmup'
import type { UpsertCategoryInputs } from '@/server/domains/taxonomies/categories/projection'
import type { Database } from '@/server/infra/db/database'
import type { CategoryRow } from '@/server/infra/db/types'
import type { AdminCategoryDto } from '@/shared/contracts/categories'

import { invalidateContent } from '@/server/domains/content/invalidate'
import { warmContentRenderCaches } from '@/server/domains/content/render-warmup'
import { countPostsByTaxonomy, listPostTitlesByCategoryId } from '@/server/domains/posts/services/taxonomy'
import { toAdminCategoryDto } from '@/server/domains/taxonomies/categories/projection'
import { findCategoryBySlug } from '@/server/domains/taxonomies/categories/services/query'
import {
  deleteAdminTaxonomy,
  ensureUniqueOnCreateTaxonomy,
  ensureUniqueOnUpdateTaxonomy,
} from '@/server/domains/taxonomies/shared'
import {
  deleteCategory as deleteCategoryRow,
  findCategoryById,
  findCategoryByName,
  insertCategory,
  listPublicCategoryRows,
  reorderCategories as reorderCategoryRows,
  updateCategory,
} from '@/server/infra/db/operations/category'
import { DomainError } from '@/server/infra/http/errors'
import { resolveSlug } from '@/server/infra/slug/resolve'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { idFromString } from '@/shared/utils/id'

// The OG request path (`http/resources/images.ts`) serves category cards
// under a `cat-`-prefixed slug and resolves an empty description to the
// site description — the warm key must fold the same inputs or it fills
// a key the crawler never asks for.
function categoryOgTarget(row: CategoryRow): OgWarmTarget {
  return {
    slug: `cat-${row.slug}`,
    title: row.name,
    summary: row.description || requireBlogSettingsSection('siteIdentity').description,
    cover: row.cover,
  }
}

export async function upsertAdminCategory(db: Database, input: UpsertCategoryInputs): Promise<AdminCategoryDto> {
  const slug = resolveSlug(input.slug, input.name, { entity: 'taxonomy' })

  if (input.id === undefined) {
    await ensureUniqueOnCreateTaxonomy(
      (name) => findCategoryByName(db, name),
      (slug) => findCategoryBySlug(db, slug),
      input.name,
      slug,
      '分类',
    )
    const row = await insertCategory(db, {
      name: input.name,
      slug,
      cover: input.cover,
      og: input.og,
      description: input.description,
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    })
    invalidateContent(db, { entity: 'category' })
    // Same crawler-first-scan warm as posts/pages (audit P1-12): the new
    // content-hash OG key renders now, not on the first crawler request.
    warmContentRenderCaches(db, categoryOgTarget(row))
    const counts = await countPostsByTaxonomy(db, { kind: 'category', gate: 'admin', name: row.name })
    return toAdminCategoryDto(row, counts.get(row.name) ?? 0)
  }

  const existing = await findCategoryById(db, input.id)
  if (existing === null) {
    throw new DomainError('NOT_FOUND', '分类不存在')
  }
  await ensureUniqueOnUpdateTaxonomy(
    (name) => findCategoryByName(db, name),
    (slug) => findCategoryBySlug(db, slug),
    input.id,
    input.name,
    existing.name,
    slug,
    existing.slug,
    '分类',
  )
  const updated = await updateCategory(db, input.id, {
    name: input.name,
    slug,
    cover: input.cover,
    og: input.og,
    description: input.description,
    ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
  })
  if (updated === null) {
    throw new DomainError('NOT_FOUND', '分类不存在')
  }
  invalidateContent(db, { entity: 'category' })
  // Re-warm under the NEW content-hash key (a rename/cover change derives
  // a fresh key — see the og bucket's key shape in `infra/cache/registry`).
  warmContentRenderCaches(db, categoryOgTarget(updated))
  const counts = await countPostsByTaxonomy(db, { kind: 'category', gate: 'admin', name: updated.name })
  return toAdminCategoryDto(updated, counts.get(updated.name) ?? 0)
}

export async function reorderAdminCategories(db: Database, orderedIds: readonly string[]): Promise<AdminCategoryDto[]> {
  const seen = new Set<string>()
  for (const id of orderedIds) {
    if (seen.has(id)) {
      throw new DomainError('BAD_REQUEST', '排序请求存在重复的分类 id')
    }
    seen.add(id)
  }

  const liveRows = await listPublicCategoryRows(db)
  if (liveRows.length !== orderedIds.length) {
    throw new DomainError('CONFLICT', '排序与最新分类列表不一致，请刷新后重试')
  }
  const liveIds = new Set(liveRows.map((row) => String(row.id)))
  for (const id of orderedIds) {
    if (!liveIds.has(id)) {
      throw new DomainError('CONFLICT', '排序与最新分类列表不一致，请刷新后重试')
    }
  }

  const [updated, counts] = await Promise.all([
    reorderCategoryRows(
      db,
      orderedIds.map((id) => idFromString(id)),
    ),
    countPostsByTaxonomy(db, { kind: 'category', gate: 'admin' }),
  ])
  invalidateContent(db, { entity: 'category' })
  return updated.map((row) => toAdminCategoryDto(row, counts.get(row.name) ?? 0))
}

export async function deleteAdminCategory(db: Database, id: number): Promise<boolean> {
  const result = await deleteAdminTaxonomy(id, '分类', {
    findById: (id) => findCategoryById(db, id),
    deleteRow: (id) => deleteCategoryRow(db, id),
    listPostTitles: (row) => listPostTitlesByCategoryId(db, row.id),
  })
  if (result) {
    invalidateContent(db, { entity: 'category' })
  }
  return result
}
