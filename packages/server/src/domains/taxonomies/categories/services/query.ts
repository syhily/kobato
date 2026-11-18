import type { Category } from '@kobato/catalog/model.ts'
import type { Database } from '@kobato/db/database.ts'
import type { CategoryRow } from '@kobato/db/types.ts'
import type { AdminCategoriesListResult } from '@kobato/server/domains/taxonomies/categories/projection.ts'

import {
  type AdminCategoriesListFilters,
  findCategoryByName,
  listAdminCategoryRows,
} from '@kobato/db/operations/category.ts'
import { category as categoryTable } from '@kobato/db/schema/taxonomy.ts'
import { hydrateImageRefs } from '@kobato/server/domains/images/services/enhance.ts'
import { countPostsByTaxonomy } from '@kobato/server/domains/posts/services/taxonomy.ts'
import { toAdminCategoryDto } from '@kobato/server/domains/taxonomies/categories/projection.ts'
import { asc, eq, inArray } from 'drizzle-orm'

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
  const rows = await db
    .select({
      name: categoryTable.name,
      slug: categoryTable.slug,
      cover: categoryTable.cover,
      description: categoryTable.description,
    })
    .from(categoryTable)
    .orderBy(asc(categoryTable.sortOrder), asc(categoryTable.id))

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

  const rows = await db
    .select({ name: categoryTable.name, slug: categoryTable.slug })
    .from(categoryTable)
    .where(inArray(categoryTable.name, uniqueNames))

  const result: Record<string, string> = {}
  for (const row of rows) {
    result[row.name] = `/cats/${row.slug}`
  }
  return result
}

// Public routes resolve strictly by slug.
export async function findCategoryBySlug(db: Database, slug: string): Promise<CategoryRow | null> {
  const rows = await db.select().from(categoryTable).where(eq(categoryTable.slug, slug)).limit(1)
  return rows[0] ?? null
}

// Feed-only: feed URLs accept a slug or legacy display name; public routes stay slug-only.
export async function resolveCategoryBySlugOrName(db: Database, value: string): Promise<CategoryRow | null> {
  return (await findCategoryBySlug(db, value)) ?? (await findCategoryByName(db, value))
}
