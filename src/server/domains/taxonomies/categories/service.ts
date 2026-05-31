import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { asc, inArray, sql } from 'drizzle-orm'

import type { CategoryRow } from '@/server/infra/db/types'
import type { Category } from '@/shared/types/catalog'
import type { AdminCategoryDto } from '@/shared/types/categories'

import { hydrateImageRefs } from '@/server/domains/images/image-meta'
import { listPostsByCategory, listPublicPosts } from '@/server/domains/posts/repos/public-query'
import {
  deleteAdminTaxonomy,
  ensureUniqueOnCreateTaxonomy,
  ensureUniqueOnUpdateTaxonomy,
  resolveSlugForTaxonomy,
} from '@/server/domains/taxonomies/shared'
import {
  type AdminCategoriesListFilters,
  deleteCategory as deleteCategoryRow,
  findCategoryById,
  findCategoryByName,
  findCategoryBySlug,
  insertCategory,
  listAdminCategoryRows,
  listPublicCategoryRows,
  reorderCategories as reorderCategoryRows,
  updateCategory,
} from '@/server/infra/db/operations/category'
import { post as postMetaTable } from '@/server/infra/db/schema/post'
import { category as categoryTable } from '@/server/infra/db/schema/taxonomy'
import { DomainError } from '@/server/infra/http/errors'
import { idFromString } from '@/shared/utils/id'

// Wire-format DTO returned by every admin category endpoint. Bigint
// id stringified so the browser bundle never touches BigInt. The
// `postCount` projection is computed by the caller (typically by
// reading `postsByCategory.length` from the live `ContentCatalog`)
// so a single catalog snapshot powers a whole list response without
// re-fetching it once per row.
export function toAdminCategoryDto(row: CategoryRow, postCount: number): AdminCategoryDto {
  return {
    id: String(row.id),
    name: row.name,
    slug: row.slug,
    cover: row.cover,
    og: row.og ?? null,
    description: row.description,
    sortOrder: row.sortOrder,
    postCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export interface AdminCategoriesListResult {
  categories: AdminCategoryDto[]
  total: number
}

// Build a "name -> post count" function from the live catalog. Single
// catalog fetch + per-row map lookup keeps `O(rows)` projection cheap
// even on large lists (the in-process `postsByCategory` map is already
// computed on catalog build). Counts include hidden + scheduled posts
// so the column matches what the delete-block guard sees.
async function categoryPostCounter(db: NodePgDatabase): Promise<(name: string) => Promise<number>> {
  return async (name: string) => {
    const posts = await listPostsByCategory(db, name, { includeHidden: true, includeScheduled: true })
    return posts.length
  }
}

// Bulk-count posts per category in a single query, then project into a
// Map. Replaces the N+1 `categoryPostCounter` for list views while
// keeping the per-category helper for single-row upserts.
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

export interface UpsertCategoryInputs {
  id?: bigint
  name: string
  /**
   * Explicit URL slug. Optional — when omitted (or the empty string),
   * the service derives one via `deriveSlug(name)` (pinyin-pro ->
   * github-slugger), matching the tag flow so admins can rely on
   * "leave blank to auto-derive".
   */
  slug?: string
  cover: string
  og?: string
  description: string
  sortOrder?: number
}

// Single entry-point that the admin Resource Route action calls. The
// `id` distinguishes update from create; both create and update enforce
// `UNIQUE (name)` and `UNIQUE (slug)` at the application layer with a
// pre-flight lookup so the editor sees a friendly 409 instead of the
// raw Drizzle constraint error.
export async function upsertAdminCategory(db: NodePgDatabase, input: UpsertCategoryInputs): Promise<AdminCategoryDto> {
  // Resolve the effective slug: an explicit non-empty value wins, an
  // empty / missing value falls back to the canonical pinyin pipeline
  // applied to the category name. We treat `''` the same as missing
  // because the admin form posts an empty string when the input is
  // cleared (Zod has already trimmed by the time we land here).
  const slug = resolveSlugForTaxonomy(input.slug, input.name)

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
    const countOf = await categoryPostCounter(db)
    return toAdminCategoryDto(row, await countOf(row.name))
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
  const countOf = await categoryPostCounter(db)
  return toAdminCategoryDto(updated, await countOf(updated.name))
}

// Drag-to-reorder. Validates that the submitted id set matches the
// live row set (no missing ids, no unknown ids) before rewriting any
// `sort_order`, so a stale UI submission cannot silently truncate or
// re-rank rows the admin has not seen. Returns the freshly-ordered
// DTOs so the client reducer can swap state in place.
export async function reorderAdminCategories(
  db: NodePgDatabase,
  orderedIds: readonly string[],
): Promise<AdminCategoryDto[]> {
  // Reject duplicates up-front — the bulk update is keyed on `id`, so
  // duplicates would silently collapse to the last index.
  const seen = new Set<string>()
  for (const id of orderedIds) {
    if (seen.has(id)) {
      throw new DomainError('BAD_REQUEST', '排序请求存在重复的分类 id')
    }
    seen.add(id)
  }

  // Compare against the live set. We use `listPublicCategoryRows()`
  // (no filtering) so a search-filtered admin view never accidentally
  // re-orders only the visible subset.
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

  const updated = await reorderCategoryRows(
    db,
    orderedIds.map((id) => idFromString(id)),
  )
  const countOf = await categoryPostCounter(db)
  return Promise.all(updated.map(async (row) => toAdminCategoryDto(row, await countOf(row.name))))
}

// Block-only deletion: refuse to delete a category any post still
// references in its frontmatter. The MDX is the source of truth for
// the `category` field — the admin must change the post's
// frontmatter before the row can be removed, otherwise the next
// catalog build would fail `validateTaxonomies` on cold start. The
// 409 message lists up to 5 referencing post titles so the admin
// knows which files to fix.
export async function deleteAdminCategory(db: NodePgDatabase, id: bigint): Promise<boolean> {
  return deleteAdminTaxonomy(id, '分类', {
    findById: (id) => findCategoryById(db, id),
    deleteRow: (id) => deleteCategoryRow(db, id),
    listPostsBy: (name) => listPostsByCategory(db, name),
  })
}

// --- Public catalog queries -------------------------------------------------

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
