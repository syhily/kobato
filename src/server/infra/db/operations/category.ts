import { and, asc, eq, ilike, or } from 'drizzle-orm'

import type { CategoryRow, NewCategory } from '@/server/infra/db/types'

import { db } from '@/server/infra/db/pool'
import { category } from '@/server/infra/db/schema'
import { escapeLikePattern } from '@/shared/utils/escape-like'

// Public listing reads. Stable `(sort_order ASC, id ASC)` order so the
// `/categories` listing has a deterministic admin-controlled ranking
// that does not change as new rows are inserted.
export async function listPublicCategoryRows(): Promise<CategoryRow[]> {
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
export async function listAdminCategoryRows(filters: AdminCategoriesListFilters = {}): Promise<CategoryRow[]> {
  const conditions = []
  if (filters.q && filters.q.trim() !== '') {
    const pattern = `%${escapeLikePattern(filters.q.trim())}%`
    conditions.push(
      or(ilike(category.name, pattern), ilike(category.slug, pattern), ilike(category.description, pattern)),
    )
  }
  const where = conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions)
  const query = db.select().from(category)
  return where
    ? query.where(where).orderBy(asc(category.sortOrder), asc(category.id))
    : query.orderBy(asc(category.sortOrder), asc(category.id))
}

export async function findCategoryById(id: bigint): Promise<CategoryRow | null> {
  const rows = await db.select().from(category).where(eq(category.id, id)).limit(1)
  return rows[0] ?? null
}

export async function findCategoryByName(name: string): Promise<CategoryRow | null> {
  const rows = await db.select().from(category).where(eq(category.name, name)).limit(1)
  return rows[0] ?? null
}

export async function findCategoryBySlug(slug: string): Promise<CategoryRow | null> {
  const rows = await db.select().from(category).where(eq(category.slug, slug)).limit(1)
  return rows[0] ?? null
}

export async function insertCategory(values: NewCategory): Promise<CategoryRow> {
  const now = new Date()
  const rows = await db
    .insert(category)
    .values({ ...values, createdAt: now, updatedAt: now })
    .returning()
  return rows[0]
}

export async function updateCategory(id: bigint, values: Partial<NewCategory>): Promise<CategoryRow | null> {
  const rows = await db
    .update(category)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(category.id, id))
    .returning()
  return rows[0] ?? null
}

export async function deleteCategory(id: bigint): Promise<boolean> {
  const result = await db.delete(category).where(eq(category.id, id)).returning({ id: category.id })
  return result.length > 0
}

// Idempotent insert used by the one-shot CLI seeder. `ON CONFLICT
// (name) DO NOTHING` mirrors the YAML invariant — categories key off
// `name` from MDX frontmatter, so a re-run of the seeder must never
// silently overwrite a row an admin has since edited. Returns `true`
// when a new row was inserted, `false` when it was skipped.
export async function seedCategoryIfMissing(values: NewCategory): Promise<boolean> {
  const now = new Date()
  const result = await db
    .insert(category)
    .values({ ...values, createdAt: now, updatedAt: now })
    .onConflictDoNothing({ target: category.name })
    .returning({ id: category.id })
  return result.length > 0
}

// Bulk-rewrite `sort_order` so the rows match the order in which their
// ids appear in `orderedIds`. Each row's `sort_order` becomes its
// 0-based index in the supplied array, and `updated_at` is bumped to
// the same wall clock so the audit trail reflects a single operation.
// The whole rewrite happens inside a single transaction so the public
//
// Returns the freshly-ordered rows in the same order as `orderedIds`,
// so callers don't need a follow-up `select` round-trip to project the
// updated DTOs back to the admin client.
export async function reorderCategories(orderedIds: readonly bigint[]): Promise<CategoryRow[]> {
  if (orderedIds.length === 0) {
    return []
  }
  const now = new Date()
  return db.transaction(async (tx) => {
    const updated: CategoryRow[] = []
    for (const [index, id] of orderedIds.entries()) {
      const rows = await tx
        .update(category)
        .set({ sortOrder: index, updatedAt: now })
        .where(eq(category.id, id))
        .returning()
      if (rows[0]) {
        updated.push(rows[0])
      }
    }
    return updated
  })
}
