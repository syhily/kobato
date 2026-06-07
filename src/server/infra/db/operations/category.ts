import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, asc, eq, inArray, or, sql } from 'drizzle-orm'

import type { CategoryRow, NewCategory } from '@/server/infra/db/types'

import { ilikeEscape } from '@/server/infra/db/ilike-escape'
import { category } from '@/server/infra/db/schema/taxonomy'

// Public listing reads. Stable `(sort_order ASC, id ASC)` order so the
// `/categories` listing has a deterministic admin-controlled ranking
// that does not change as new rows are inserted.
export async function listPublicCategoryRows(db: NodePgDatabase): Promise<CategoryRow[]> {
  return db.select().from(category).orderBy(asc(category.sortOrder), asc(category.id))
}

export interface AdminCategoriesListFilters {
  q?: string
}

// Admin list view. Mirrors `listAdminFriendRows` in spirit but uses
// `(sort_order ASC, id ASC)` ordering so the table reflects the live
// public order; admins editing `sortOrder` see the change immediately.
// `q` matches name / slug / description (case-insensitive `ILIKE`) so
// the search box on the toolbar finds rows by either the Chinese name
// or the URL slug.
export async function listAdminCategoryRows(
  db: NodePgDatabase,
  filters: AdminCategoriesListFilters = {},
): Promise<CategoryRow[]> {
  const conditions = []
  if (filters.q && filters.q.trim() !== '') {
    const q = filters.q.trim()
    conditions.push(
      or(ilikeEscape(category.name, q), ilikeEscape(category.slug, q), ilikeEscape(category.description, q)),
    )
  }
  const where = conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions)
  const query = db.select().from(category)
  return where
    ? query.where(where).orderBy(asc(category.sortOrder), asc(category.id))
    : query.orderBy(asc(category.sortOrder), asc(category.id))
}

export async function findCategoryById(db: NodePgDatabase, id: bigint): Promise<CategoryRow | null> {
  const rows = await db.select().from(category).where(eq(category.id, id)).limit(1)
  return rows[0] ?? null
}

export async function findCategoryByName(db: NodePgDatabase, name: string): Promise<CategoryRow | null> {
  const rows = await db.select().from(category).where(eq(category.name, name)).limit(1)
  return rows[0] ?? null
}

export async function findCategoryBySlug(db: NodePgDatabase, slug: string): Promise<CategoryRow | null> {
  const rows = await db.select().from(category).where(eq(category.slug, slug)).limit(1)
  return rows[0] ?? null
}

export async function insertCategory(db: NodePgDatabase, values: NewCategory): Promise<CategoryRow> {
  const now = new Date()
  const rows = await db
    .insert(category)
    .values({ ...values, createdAt: now, updatedAt: now })
    .returning()
  return rows[0]
}

export async function updateCategory(
  db: NodePgDatabase,
  id: bigint,
  values: Partial<NewCategory>,
): Promise<CategoryRow | null> {
  const rows = await db
    .update(category)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(category.id, id))
    .returning()
  return rows[0] ?? null
}

export async function deleteCategory(db: NodePgDatabase, id: bigint): Promise<boolean> {
  const result = await db.delete(category).where(eq(category.id, id)).returning({ id: category.id })
  return result.length > 0
}

// Idempotent insert used by the one-shot CLI seeder. `ON CONFLICT
// Bulk-rewrite `sort_order` so the rows match the order in which their
// ids appear in `orderedIds`. Each row's `sort_order` becomes its
// 0-based index in the supplied array, and `updated_at` is bumped to
// the same wall clock so the audit trail reflects a single operation.
// The whole rewrite happens inside a single transaction so the public
//
// Returns the freshly-ordered rows in the same order as `orderedIds`,
// so callers don't need a follow-up `select` round-trip to project the
// updated DTOs back to the admin client.
export async function reorderCategories(db: NodePgDatabase, orderedIds: readonly bigint[]): Promise<CategoryRow[]> {
  if (orderedIds.length === 0) {
    return []
  }
  const now = new Date()
  const whens = sql.join(
    orderedIds.map((id, i) => sql`WHEN ${category.id} = ${id} THEN ${i}`),
    sql` `,
  )
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(category)
      .set({ sortOrder: sql`CASE ${whens} END::integer`, updatedAt: now })
      .where(inArray(category.id, [...orderedIds]))
      .returning()
    const byId = new Map(rows.map((r) => [r.id, r]))
    return orderedIds.map((id) => byId.get(id)!).filter(Boolean)
  })
}
