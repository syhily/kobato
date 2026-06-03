import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { asc, inArray, sql } from 'drizzle-orm'

import type { AdminCategoriesListResult } from '@/server/domains/taxonomies/categories/projection'
import type { Category } from '@/shared/types/catalog'

import { hydrateImageRefs } from '@/server/domains/images/services/enhance'
import { listPublicPosts } from '@/server/domains/posts/repos/public-query'
import { toAdminCategoryDto } from '@/server/domains/taxonomies/categories/projection'
import { type AdminCategoriesListFilters, listAdminCategoryRows } from '@/server/infra/db/operations/category'
import { post as postMetaTable } from '@/server/infra/db/schema/post'
import { category as categoryTable } from '@/server/infra/db/schema/taxonomy'

async function countPostsByCategories(db: NodePgDatabase): Promise<Map<string, number>> {
  const metas = await listPublicPosts(db, { includeHidden: true, includeScheduled: true })
  const counts = new Map<string, number>()
  for (const meta of metas) {
    const cat = meta.category
    if (cat) {
      counts.set(cat, (counts.get(cat) ?? 0) + 1)
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

export async function listAllCategories(db: NodePgDatabase): Promise<Category[]> {
  const now = new Date()
  const rows = await db
    .select({
      name: categoryTable.name,
      slug: categoryTable.slug,
      cover: categoryTable.cover,
      description: categoryTable.description,
      counts: sql<number>`COALESCE((
        SELECT COUNT(*)::int FROM ${postMetaTable}
        WHERE ${postMetaTable.category} = ${categoryTable.name}
          AND ${postMetaTable.deletedAt} IS NULL
          AND ${postMetaTable.published} = true
          AND ${postMetaTable.visible} = true
          AND ${postMetaTable.publishedAt} <= ${now}
      ), 0)`.as('counts'),
    })
    .from(categoryTable)
    .orderBy(asc(categoryTable.sortOrder), asc(categoryTable.id))

  const categories: Category[] = []
  for (const row of rows) {
    categories.push({
      name: row.name,
      slug: row.slug,
      cover: row.cover,
      description: row.description,
      counts: row.counts,
      permalink: `/cats/${row.slug}`,
    })
  }

  await hydrateCategoryImages(db, categories)
  return categories
}

export async function getCategoryLink(db: NodePgDatabase, name: string): Promise<string> {
  const { findCategoryByName } = await import('@/server/infra/db/operations/category')
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
