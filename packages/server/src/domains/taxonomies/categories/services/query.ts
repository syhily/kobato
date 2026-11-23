import type { Category } from '@kobato/catalog/model'
import type { Database } from '@kobato/db/sqlite/database'
import type { CategoryRow } from '@kobato/db/sqlite/types'
import type { AdminCategoriesListResult } from '@kobato/server/domains/taxonomies/categories/projection'

import {
  type AdminCategoriesListFilters,
  findCategoryByName,
  findCategoryBySlug as findCategoryBySlugOp,
  findCategoryNameSlugByNames,
  listAdminCategoryRows,
  listPublicCategoryRows,
} from '@kobato/db/sqlite/operations/taxonomy/category'
import { hydrateImageRefs } from '@kobato/server/domains/images/services/enhance'
import { countPostsByTaxonomy } from '@kobato/server/domains/posts/services/taxonomy'
import { toAdminCategoryDto } from '@kobato/server/domains/taxonomies/categories/projection'

export async function listCategoriesForAdmin(
  db: Database,
  filters: AdminCategoriesListFilters,
): Promise<AdminCategoriesListResult> {
  const [rows, counts] = await Promise.all([
    listAdminCategoryRows(db, filters),
    countPostsByTaxonomy(db, { kind: 'category', gate: 'admin' }),
  ])
  return {
    categories: rows.map((row) => toAdminCategoryDto(row, counts.get(row.name) ?? 0)),
    total: rows.length,
  }
}

async function hydrateCategoryImages(db: Database, categories: Category[]): Promise<void> {
  await hydrateImageRefs(
    db,
    categories,
    (c) => c.cover,
    (c, lookup) => {
      c.coverThumbhash = lookup?.thumbhash
      if (lookup?.publicUrl != null) {
        c.cover = lookup.publicUrl
      }
    },
  )
}

export async function listAllCategories(db: Database): Promise<Category[]> {
  const rows = await listPublicCategoryRows(db)

  const countsMap = await countPostsByTaxonomy(db, { kind: 'category', gate: 'public' })

  const categories: Category[] = rows.map((row) => ({
    name: row.name,
    slug: row.slug,
    cover: row.cover,
    description: row.description,
    counts: countsMap.get(row.name) ?? 0,
    permalink: `/cats/${row.slug}`,
  }))

  await hydrateCategoryImages(db, categories)
  return categories
}

export async function getCategoryLinks(db: Database, names: readonly string[]): Promise<Record<string, string>> {
  const uniqueNames = [...new Set(names.filter((n): n is string => Boolean(n)))]
  if (uniqueNames.length === 0) {
    return {}
  }

  const rows = await findCategoryNameSlugByNames(db, uniqueNames)

  const result: Record<string, string> = {}
  for (const row of rows) {
    result[row.name] = `/cats/${row.slug}`
  }
  return result
}

export async function findCategoryBySlug(db: Database, slug: string): Promise<CategoryRow | null> {
  return findCategoryBySlugOp(db, slug)
}

export async function resolveCategoryBySlugOrName(db: Database, value: string): Promise<CategoryRow | null> {
  return (await findCategoryBySlug(db, value)) ?? (await findCategoryByName(db, value))
}
