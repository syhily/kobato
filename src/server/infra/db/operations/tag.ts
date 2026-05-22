import { asc, count, eq, ilike, or, type SQL } from 'drizzle-orm'

import type { NewTag, TagRow } from '@/server/infra/db/types'

import { db } from '@/server/infra/db/pool'
import { tag } from '@/server/infra/db/schema'
import { escapeLikePattern } from '@/shared/utils/escape-like'

// Public listing reads. Stable `name ASC` order so the `/tags`
// catalogue (and any sidebar widget that surfaces the full list) has
// a deterministic ordering. The post-derived `counts` projection
// happens in `ContentCatalog`; everything that needs the
// usage-sorted view (e.g. tag clouds) sorts there.
export async function listPublicTagRows(): Promise<TagRow[]> {
  return db.select().from(tag).orderBy(asc(tag.name))
}

export interface AdminTagsListFilters {
  q?: string
  /** Zero-based offset for pagination. Defaults to 0 when undefined. */
  offset?: number
  /** Page size. When undefined, all matching rows are returned (used by callers that need the full list). */
  limit?: number
}

// Build the shared `WHERE` clause used by both `listAdminTagRows` and
// `countAdminTags`. Keeping the construction in one place ensures the
// row listing and the pagination counter always filter on the same
// predicate; if they drifted, `total` would be inconsistent with the
// returned page (and `hasMore` would lie).
function buildAdminTagWhere(filters: AdminTagsListFilters): SQL | undefined {
  if (filters.q && filters.q.trim() !== '') {
    const pattern = `%${escapeLikePattern(filters.q.trim())}%`
    return or(ilike(tag.name, pattern), ilike(tag.slug, pattern))
  }
  return undefined
}

// Admin list view. `name ASC` matches the public listing so admins
// can find a row by its Chinese name without an extra mental sort
// step. Optional `q` matches `name` or `slug` with `ILIKE`. When
// `offset`/`limit` are supplied we paginate server-side; otherwise we
// return the full filtered set (the catalog backfill and tests rely
// on the latter).
export async function listAdminTagRows(filters: AdminTagsListFilters = {}): Promise<TagRow[]> {
  const where = buildAdminTagWhere(filters)
  // Drizzle's builder narrows the return type on each chained method,
  // so we keep the chain expression and only branch on offset/limit at
  // the very end. `0` is a legitimate offset value, so we test for
  // `!== undefined` rather than truthiness.
  let q = where
    ? db.select().from(tag).where(where).orderBy(asc(tag.name))
    : db.select().from(tag).orderBy(asc(tag.name))
  if (filters.limit !== undefined) {
    q = q.limit(filters.limit) as typeof q
  }
  if (filters.offset !== undefined && filters.offset > 0) {
    q = q.offset(filters.offset) as typeof q
  }
  return q
}

// Pagination counter. Returns the total number of rows matching the
// same `q` filter `listAdminTagRows` uses, ignoring `offset`/`limit`.
// Powers the `total` field of the admin list response so the table's
// pagination control can render the right number of pages.
export async function countAdminTags(filters: AdminTagsListFilters = {}): Promise<number> {
  const where = buildAdminTagWhere(filters)
  const rows = where
    ? await db.select({ value: count() }).from(tag).where(where)
    : await db.select({ value: count() }).from(tag)
  return rows[0]?.value ?? 0
}

export async function findTagById(id: bigint): Promise<TagRow | null> {
  const rows = await db.select().from(tag).where(eq(tag.id, id)).limit(1)
  return rows[0] ?? null
}

export async function findTagByName(name: string): Promise<TagRow | null> {
  const rows = await db.select().from(tag).where(eq(tag.name, name)).limit(1)
  return rows[0] ?? null
}

export async function findTagBySlug(slug: string): Promise<TagRow | null> {
  const rows = await db.select().from(tag).where(eq(tag.slug, slug)).limit(1)
  return rows[0] ?? null
}

export async function insertTag(values: NewTag): Promise<TagRow> {
  const now = new Date()
  const rows = await db
    .insert(tag)
    .values({ ...values, createdAt: now, updatedAt: now })
    .returning()
  return rows[0]
}

export async function updateTag(id: bigint, values: Partial<NewTag>): Promise<TagRow | null> {
  const rows = await db
    .update(tag)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(tag.id, id))
    .returning()
  return rows[0] ?? null
}

export async function deleteTag(id: bigint): Promise<boolean> {
  const result = await db.delete(tag).where(eq(tag.id, id)).returning({ id: tag.id })
  return result.length > 0
}

// Idempotent insert used by the one-shot CLI seeder. `ON CONFLICT
// (name) DO NOTHING` so a re-run never overwrites a row the admin
// has since edited (slug rename, …). Returns `true` when a new row
// was inserted, `false` when the row already exists.
export async function seedTagIfMissing(values: NewTag, tx = db): Promise<boolean> {
  const now = new Date()
  const result = await tx
    .insert(tag)
    .values({ ...values, createdAt: now, updatedAt: now })
    .onConflictDoNothing({ target: tag.name })
    .returning({ id: tag.id })
  return result.length > 0
}
