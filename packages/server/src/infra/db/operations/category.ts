import type { Database } from '@kobato/server/infra/db/database'
import type { CategoryRow, NewCategory } from '@kobato/server/infra/db/types'

import { likeEscape } from '@kobato/server/infra/db/like-escape'
import { assembleWhere } from '@kobato/server/infra/db/operations/admin-list'
import { category } from '@kobato/server/infra/db/schema/taxonomy'
import { asc, eq, inArray, or, sql, type SQL } from 'drizzle-orm'

// Public listing reads. Stable `(sort_order ASC, id ASC)` order so the
// `/categories` listing has a deterministic admin-controlled ranking
// that does not change as new rows are inserted.
export async function listPublicCategoryRows(db: Database): Promise<CategoryRow[]> {
  return db.select().from(category).orderBy(asc(category.sortOrder), asc(category.id))
}

export interface AdminCategoriesListFilters {
  q?: string
}

// Admin list view. Mirrors `listAdminFriendRows` in spirit but uses
// `(sort_order ASC, id ASC)` ordering so the table reflects the live
// public order; admins editing `sortOrder` see the change immediately.
// `q` matches name / slug / description (case-insensitive `LIKE`) so
// the search box on the toolbar finds rows by either the Chinese name
// or the URL slug.
export async function listAdminCategoryRows(
  db: Database,
  filters: AdminCategoriesListFilters = {},
): Promise<CategoryRow[]> {
  const conditions: SQL[] = []
  if (filters.q && filters.q.trim() !== '') {
    const q = filters.q.trim()
    const search = or(likeEscape(category.name, q), likeEscape(category.slug, q), likeEscape(category.description, q))
    if (search) {
      conditions.push(search)
    }
  }
  const where = assembleWhere(conditions)
  const query = db.select().from(category)
  return where
    ? query.where(where).orderBy(asc(category.sortOrder), asc(category.id))
    : query.orderBy(asc(category.sortOrder), asc(category.id))
}

export async function findCategoryById(db: Database, id: number): Promise<CategoryRow | null> {
  const rows = await db.select().from(category).where(eq(category.id, id)).limit(1)
  return rows[0] ?? null
}

export async function findCategoryByName(db: Database, name: string): Promise<CategoryRow | null> {
  const rows = await db.select().from(category).where(eq(category.name, name)).limit(1)
  return rows[0] ?? null
}

// The single seam for post→category name resolution: posts store
// `category_id`, listings project the display NAME onto the wire DTO.
// Mount this in `hydratePostList`-style pipelines (next to the tag-name
// batch) rather than hand-joining per query.
export async function findCategoryNamesByIds(db: Database, ids: readonly number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  if (ids.length === 0) {
    return map
  }
  const unique = [...new Set(ids)]
  const rows = await db
    .select({ id: category.id, name: category.name })
    .from(category)
    .where(inArray(category.id, unique))
  for (const row of rows) {
    map.set(row.id, row.name)
  }
  return map
}

export async function insertCategory(db: Database, values: NewCategory): Promise<CategoryRow> {
  const now = new Date()
  const rows = await db
    .insert(category)
    .values({ ...values, createdAt: now, updatedAt: now })
    .returning()
  return rows[0]
}

export async function updateCategory(
  db: Database,
  id: number,
  values: Partial<NewCategory>,
): Promise<CategoryRow | null> {
  const rows = await db
    .update(category)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(category.id, id))
    .returning()
  return rows[0] ?? null
}

export async function deleteCategory(db: Database, id: number): Promise<boolean> {
  const result = await db.delete(category).where(eq(category.id, id)).returning({ id: category.id })
  return result.length > 0
}

// Bulk-rewrite `sort_order` so each row's `sort_order` becomes its
// 0-based index in `orderedIds`, with `updated_at` bumped to one shared
// wall clock so the audit trail reflects a single operation. The whole
// rewrite runs inside a single transaction so the public listing never
// shows a half-applied ranking.
//
// Returns the freshly-ordered rows in the same order as `orderedIds`,
// so callers don't need a follow-up `select` round-trip to project the
// updated DTOs back to the admin client.
export async function reorderCategories(db: Database, orderedIds: readonly number[]): Promise<CategoryRow[]> {
  if (orderedIds.length === 0) {
    return []
  }
  const now = new Date()
  const whens = sql.join(
    orderedIds.map((id, i) => sql`WHEN ${category.id} = ${id} THEN ${i}`),
    sql` `,
  )
  return db.transaction((tx) => {
    const rows = tx
      .update(category)
      .set({ sortOrder: sql`CASE ${whens} END`, updatedAt: now })
      .where(inArray(category.id, [...orderedIds]))
      .returning()
      .all()
    const byId = new Map(rows.map((r) => [r.id, r]))
    return orderedIds.map((id) => byId.get(id)!).filter(Boolean)
  })
}

export async function findCategoriesByNames(db: Database, names: readonly string[]): Promise<CategoryRow[]> {
  if (names.length === 0) {
    return []
  }
  const unique = [...new Set(names)]
  return db.select().from(category).where(inArray(category.name, unique))
}
