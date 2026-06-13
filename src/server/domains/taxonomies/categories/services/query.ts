import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'

import type { AdminCategoriesListResult } from '@/server/domains/taxonomies/categories/projection'
import type { Category } from '@/shared/types/catalog'

import { hydrateImageRefs } from '@/server/domains/images/services/enhance'
import { toAdminCategoryDto } from '@/server/domains/taxonomies/categories/projection'
import { createRedisCache } from '@/server/infra/cache/redis-cache'
import {
  type AdminCategoriesListFilters,
  findCategoriesByNames,
  findCategoryByName,
  findCategoryBySlug,
  listAdminCategoryRows,
} from '@/server/infra/db/operations/category'
import { post as postMetaTable } from '@/server/infra/db/schema/post'
import { category as categoryTable } from '@/server/infra/db/schema/taxonomy'
import { createInflight } from '@/server/infra/redis/inflight'

async function countPostsByCategories(db: NodePgDatabase): Promise<Map<string, number>> {
  const rows = await db
    .select({
      category: postMetaTable.category,
      count: sql<number>`count(${postMetaTable.id})::int`,
    })
    .from(postMetaTable)
    .where(and(isNull(postMetaTable.deletedAt), eq(postMetaTable.published, true)))
    .groupBy(postMetaTable.category)
  const counts = new Map<string, number>()
  for (const row of rows) {
    if (row.category) {
      counts.set(row.category, row.count)
    }
  }
  return counts
}

export async function listCategoriesForAdmin(
  db: NodePgDatabase,
  filters: AdminCategoriesListFilters,
): Promise<AdminCategoriesListResult> {
  const [rows, counts] = await Promise.all([listAdminCategoryRows(db, filters), countPostsByCategories(db)])
  return {
    categories: rows.map((row) => toAdminCategoryDto(row, counts.get(row.name) ?? 0)),
    total: rows.length,
  }
}

async function hydrateCategoryImages(db: NodePgDatabase, categories: Category[]): Promise<void> {
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

const categoriesCache = createRedisCache<Category[]>('categories:all', { ttlMs: 30_000 })
const categoriesInflight = createInflight<Category[]>()

export { categoriesCache }

export async function listAllCategories(db: NodePgDatabase): Promise<Category[]> {
  const cached = await categoriesCache.get()
  if (cached !== null) {
    return cached
  }

  return categoriesInflight('listAllCategories', async () => {
    const cachedInner = await categoriesCache.get()
    if (cachedInner !== null) {
      return cachedInner
    }

    const categories = await queryAllCategories(db)
    await categoriesCache.set(categories)
    return categories
  })
}

async function queryAllCategories(db: NodePgDatabase): Promise<Category[]> {
  const now = new Date()
  const rows = await db
    .select({
      name: categoryTable.name,
      slug: categoryTable.slug,
      cover: categoryTable.cover,
      description: categoryTable.description,
    })
    .from(categoryTable)
    .orderBy(asc(categoryTable.sortOrder), asc(categoryTable.id))

  const countsResult = await db
    .select({
      category: postMetaTable.category,
      count: sql<number>`count(${postMetaTable.id})::int`,
    })
    .from(postMetaTable)
    .where(
      and(
        isNull(postMetaTable.deletedAt),
        eq(postMetaTable.published, true),
        eq(postMetaTable.visible, true),
        sql`${postMetaTable.publishedAt} <= ${now}`,
      ),
    )
    .groupBy(postMetaTable.category)

  const countsMap = new Map<string, number>()
  for (const row of countsResult) {
    if (row.category) {
      countsMap.set(row.category, row.count)
    }
  }

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

export async function getCategoryLink(db: NodePgDatabase, name: string): Promise<string> {
  const category = await findCategoryByName(db, name)
  return category ? `/cats/${category.slug}` : ''
}

export async function getCategoryLinks(db: NodePgDatabase, names: readonly string[]): Promise<Record<string, string>> {
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

export { findCategoriesByNames, findCategoryByName, findCategoryBySlug }
