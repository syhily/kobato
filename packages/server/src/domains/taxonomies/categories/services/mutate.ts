import type { Database } from '@kobato/db/database.ts'
import type { CategoryRow } from '@kobato/db/types.ts'
import type { OgWarmTarget } from '@kobato/server/domains/content/render-warmup.ts'
import type { UpsertCategoryInputs } from '@kobato/server/domains/taxonomies/categories/projection.ts'
import type { AdminCategoryDto } from '@kobato/shared/contracts/categories.ts'

import {
  deleteCategory as deleteCategoryRow,
  findCategoryById,
  findCategoryByName,
  insertCategory,
  listPublicCategoryRows,
  reorderCategories as reorderCategoryRows,
  updateCategory,
} from '@kobato/db/operations/category.ts'
import { invalidateContent } from '@kobato/server/domains/content/invalidate.ts'
import { warmContentRenderCaches } from '@kobato/server/domains/content/render-warmup.ts'
import { countPostsByTaxonomy, listPostTitlesByCategoryId } from '@kobato/server/domains/posts/services/taxonomy.ts'
import { toAdminCategoryDto } from '@kobato/server/domains/taxonomies/categories/projection.ts'
import { findCategoryBySlug } from '@kobato/server/domains/taxonomies/categories/services/query.ts'
import {
  deleteAdminTaxonomy,
  ensureUniqueOnCreateTaxonomy,
  ensureUniqueOnUpdateTaxonomy,
  taxonomyNotFound,
} from '@kobato/server/domains/taxonomies/shared.ts'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'
import { resolveSlug } from '@kobato/server/infra/slug/resolve.ts'
import { requireBlogSettingsSection } from '@kobato/shared/config/getters.ts'
import { idFromString } from '@kobato/shared/utils/id.ts'

// Warm key must match the OG route's inputs: `cat-` slug, empty description → site description.
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
      'category',
    )
    const row = await insertCategory(db, {
      name: input.name,
      slug,
      cover: input.cover,
      og: input.og,
      description: input.description,
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    })
    invalidateContent({ entity: 'category' })
    // Warm the new content-hash OG key now, not on first crawler request.
    warmContentRenderCaches(categoryOgTarget(row))
    const counts = await countPostsByTaxonomy(db, { kind: 'category', gate: 'admin', name: row.name })
    return toAdminCategoryDto(row, counts.get(row.name) ?? 0)
  }

  const existing = await findCategoryById(db, input.id)
  if (existing === null) {
    throw taxonomyNotFound('category')
  }
  await ensureUniqueOnUpdateTaxonomy(
    (name) => findCategoryByName(db, name),
    (slug) => findCategoryBySlug(db, slug),
    input.id,
    input.name,
    existing.name,
    slug,
    existing.slug,
    'category',
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
    throw taxonomyNotFound('category')
  }
  invalidateContent({ entity: 'category' })
  // Rename/cover change derives a fresh content-hash key — re-warm under it.
  warmContentRenderCaches(categoryOgTarget(updated))
  const counts = await countPostsByTaxonomy(db, { kind: 'category', gate: 'admin', name: updated.name })
  return toAdminCategoryDto(updated, counts.get(updated.name) ?? 0)
}

export async function reorderAdminCategories(db: Database, orderedIds: readonly string[]): Promise<AdminCategoryDto[]> {
  const seen = new Set<string>()
  for (const id of orderedIds) {
    if (seen.has(id)) {
      throw new DomainError('BAD_REQUEST', descriptorFor('taxonomy.error.duplicateOrderIds'))
    }
    seen.add(id)
  }

  const liveRows = await listPublicCategoryRows(db)
  if (liveRows.length !== orderedIds.length) {
    throw new DomainError('CONFLICT', descriptorFor('taxonomy.error.orderStale'))
  }
  const liveIds = new Set(liveRows.map((row) => String(row.id)))
  for (const id of orderedIds) {
    if (!liveIds.has(id)) {
      throw new DomainError('CONFLICT', descriptorFor('taxonomy.error.orderStale'))
    }
  }

  const [updated, counts] = await Promise.all([
    reorderCategoryRows(
      db,
      orderedIds.map((id) => idFromString(id)),
    ),
    countPostsByTaxonomy(db, { kind: 'category', gate: 'admin' }),
  ])
  invalidateContent({ entity: 'category' })
  return updated.map((row) => toAdminCategoryDto(row, counts.get(row.name) ?? 0))
}

export async function deleteAdminCategory(db: Database, id: number): Promise<boolean> {
  const result = await deleteAdminTaxonomy(id, 'category', {
    findById: (id) => findCategoryById(db, id),
    deleteRow: (id) => deleteCategoryRow(db, id),
    listPostTitles: (row) => listPostTitlesByCategoryId(db, row.id),
  })
  if (result) {
    invalidateContent({ entity: 'category' })
  }
  return result
}
