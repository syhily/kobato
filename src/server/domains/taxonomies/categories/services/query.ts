import { asc, eq, inArray } from 'drizzle-orm'

import type { AdminCategoriesListResult } from '@/server/domains/taxonomies/categories/projection'
import type { Database } from '@/server/infra/db/database'
import type { CategoryRow } from '@/server/infra/db/types'
import type { Category } from '@/shared/types/catalog'

import { hydrateImageRefs } from '@/server/domains/images/services/enhance'
import { countPostsByTaxonomy } from '@/server/domains/posts/services/taxonomy'
import { toAdminCategoryDto } from '@/server/domains/taxonomies/categories/projection'
import { through } from '@/server/infra/cache/registry'
import {
  type AdminCategoriesListFilters,
  findCategoryByName,
  listAdminCategoryRows,
} from '@/server/infra/db/operations/category'
import { category as categoryTable } from '@/server/infra/db/schema/taxonomy'

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
  return through(db, 'categories', {}, () => queryAllCategories(db))
}

async function queryAllCategories(db: Database): Promise<Category[]> {
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

export async function getCategoryLink(db: Database, name: string): Promise<string> {
  const category = await findCategoryByName(db, name)
  return category ? `/cats/${category.slug}` : ''
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

// Slug lookup promoted from `infra/db/operations/category`: category
// resolution is a taxonomy-domain capability, and its consumers (public
// category route, OG-image resource, the ensure-unique guards in
// `mutate.ts`, the feed resolver below) all live on this surface.
// Public routes resolve strictly by slug — the feed's
// slug-or-name fallback composes this with `findCategoryByName`.
export async function findCategoryBySlug(db: Database, slug: string): Promise<CategoryRow | null> {
  const rows = await db.select().from(categoryTable).where(eq(categoryTable.slug, slug)).limit(1)
  return rows[0] ?? null
}

// Feed-only resolution rule: feed URLs accept a category slug, but
// legacy subscribers may carry the display name. Public routes stay
// slug-only. Deliberately shallow: one composition, no state, no cache.
export async function resolveCategoryBySlugOrName(db: Database, value: string): Promise<CategoryRow | null> {
  return (await findCategoryBySlug(db, value)) ?? (await findCategoryByName(db, value))
}
