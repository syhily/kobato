import type { Database } from '@kobato/db/database'
import type { CategoryRow, NewCategory } from '@kobato/db/types'

import { sqliteOf } from '@kobato/db/database'
import { likeEscape } from '@kobato/db/like-escape'
import { assembleWhere } from '@kobato/db/operations/admin-list'
import { category } from '@kobato/db/schema/taxonomy'
import { asc, eq, inArray, or, sql, type SQL } from 'drizzle-orm'

export async function listPublicCategoryRows(db: Database): Promise<CategoryRow[]> {
  return sqliteOf(db).select().from(category).orderBy(asc(category.sortOrder), asc(category.id))
}

export interface AdminCategoriesListFilters {
  q?: string
}

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
  const query = sqliteOf(db).select().from(category)
  return where
    ? query.where(where).orderBy(asc(category.sortOrder), asc(category.id))
    : query.orderBy(asc(category.sortOrder), asc(category.id))
}

export async function findCategoryById(db: Database, id: number): Promise<CategoryRow | null> {
  const rows = await sqliteOf(db).select().from(category).where(eq(category.id, id)).limit(1)
  return rows[0] ?? null
}

export async function findCategoryByName(db: Database, name: string): Promise<CategoryRow | null> {
  const rows = await sqliteOf(db).select().from(category).where(eq(category.name, name)).limit(1)
  return rows[0] ?? null
}

export async function findCategoryNamesByIds(db: Database, ids: readonly number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  if (ids.length === 0) {
    return map
  }
  const unique = [...new Set(ids)]
  const rows = await sqliteOf(db)
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
  const rows = await sqliteOf(db)
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
  const rows = await sqliteOf(db)
    .update(category)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(category.id, id))
    .returning()
  return rows[0] ?? null
}

export async function deleteCategory(db: Database, id: number): Promise<boolean> {
  const result = await sqliteOf(db).delete(category).where(eq(category.id, id)).returning({ id: category.id })
  return result.length > 0
}

export async function reorderCategories(db: Database, orderedIds: readonly number[]): Promise<CategoryRow[]> {
  if (orderedIds.length === 0) {
    return []
  }
  const now = new Date()
  const whens = sql.join(
    orderedIds.map((id, i) => sql`WHEN ${category.id} = ${id} THEN ${i}`),
    sql` `,
  )
  return sqliteOf(db).transaction((tx) => {
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
  return sqliteOf(db).select().from(category).where(inArray(category.name, unique))
}

export async function findCategoryBySlug(db: Database, slug: string): Promise<CategoryRow | null> {
  const rows = await sqliteOf(db).select().from(category).where(eq(category.slug, slug)).limit(1)
  return rows[0] ?? null
}

export async function findCategoryNameSlugByNames(
  db: Database,
  names: readonly string[],
): Promise<Array<{ name: string; slug: string }>> {
  if (names.length === 0) {
    return []
  }
  const unique = [...new Set(names)]
  return sqliteOf(db)
    .select({ name: category.name, slug: category.slug })
    .from(category)
    .where(inArray(category.name, unique))
}
