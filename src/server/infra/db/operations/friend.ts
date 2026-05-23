import { and, count, desc, eq, ilike, or, type SQL, sql } from 'drizzle-orm'

import type { FriendRow, NewFriend } from '@/server/infra/db/types'

import { db } from '@/server/infra/db/pool'
import { friend } from '@/server/infra/db/schema/friend'
import { escapeLikePattern } from '@/shared/utils/escape-like'

// Stable ascending id ordering for the public catalog. Output is fed
// into `hydrateImages()` and the MDX `<Friends />` shuffle, so the
// renderer-visible order is randomised per request — the SQL `ORDER
// BY` exists only so thumbhash hydration produces deterministic
// per-deploy resolution order, which keeps the in-process inflight
// cache hot across reloads.
export async function listPublicFriendRows(): Promise<FriendRow[]> {
  return db.select().from(friend).where(eq(friend.visible, true)).orderBy(friend.id)
}

export interface AdminFriendsListFilters {
  q?: string
  includeHidden?: boolean
  /** Zero-based offset for pagination. Defaults to 0 when undefined. */
  offset?: number
  /** Page size. When undefined, all matching rows are returned. */
  limit?: number
}

// Build the shared `WHERE` clause used by both `listAdminFriendRows`
// and `countAdminFriends`. Keeping construction in one place ensures
// the row listing and the pagination counter always filter on the
// same predicate; if they drifted, `total` would be inconsistent
// with the returned page (and `hasMore` would lie).
function buildAdminFriendWhere(filters: AdminFriendsListFilters): SQL | undefined {
  const conditions: SQL[] = []
  if (!filters.includeHidden) {
    conditions.push(eq(friend.visible, true))
  }
  if (filters.q && filters.q.trim() !== '') {
    const pattern = `%${escapeLikePattern(filters.q.trim())}%`
    const search = or(
      ilike(friend.website, pattern),
      ilike(friend.description, pattern),
      ilike(friend.homepage, pattern),
    )
    if (search) {
      conditions.push(search)
    }
  }
  if (conditions.length === 0) {
    return undefined
  }
  if (conditions.length === 1) {
    return conditions[0]
  }
  return and(...conditions)
}

// Admin list view. Newest entries surface first so the most recently
// added friend is one click away. The optional `q` matches against
// `website`, `description`, and `homepage` with case-insensitive
// `ILIKE` so admins can find a row by either the display name or the
// URL. `includeHidden` flips whether `visible=false` rows appear; the
// default mirrors the public site (visible only). When `offset` /
// `limit` are supplied we paginate server-side.
export async function listAdminFriendRows(filters: AdminFriendsListFilters = {}): Promise<FriendRow[]> {
  const where = buildAdminFriendWhere(filters)
  let q = where
    ? db.select().from(friend).where(where).orderBy(desc(friend.createdAt))
    : db.select().from(friend).orderBy(desc(friend.createdAt))
  if (filters.limit !== undefined) {
    q = q.limit(filters.limit) as typeof q
  }
  if (filters.offset !== undefined && filters.offset > 0) {
    q = q.offset(filters.offset) as typeof q
  }
  return q
}

// Pagination counter. Returns the total number of rows matching the
// same `q` + `includeHidden` filter `listAdminFriendRows` uses,
// ignoring `offset`/`limit`. Powers the `total` field of the admin
// list response so the table's pagination control can render the
// right number of pages.
export async function countAdminFriends(filters: AdminFriendsListFilters = {}): Promise<number> {
  const where = buildAdminFriendWhere(filters)
  const rows = where
    ? await db.select({ value: count() }).from(friend).where(where)
    : await db.select({ value: count() }).from(friend)
  return rows[0]?.value ?? 0
}

export async function findFriendById(id: bigint): Promise<FriendRow | null> {
  const rows = await db.select().from(friend).where(eq(friend.id, id)).limit(1)
  return rows[0] ?? null
}

export async function findFriendByHomepage(homepage: string): Promise<FriendRow | null> {
  const rows = await db.select().from(friend).where(eq(friend.homepage, homepage)).limit(1)
  return rows[0] ?? null
}

export async function insertFriend(values: NewFriend): Promise<FriendRow> {
  const now = new Date()
  const rows = await db
    .insert(friend)
    .values({ ...values, createdAt: now, updatedAt: now })
    .returning()
  return rows[0]
}

export async function updateFriend(id: bigint, values: Partial<NewFriend>): Promise<FriendRow | null> {
  const rows = await db
    .update(friend)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(friend.id, id))
    .returning()
  return rows[0] ?? null
}

export async function deleteFriend(id: bigint): Promise<boolean> {
  const result = await db.delete(friend).where(eq(friend.id, id)).returning({ id: friend.id })
  return result.length > 0
}

// Best-effort homepage de-dup for the install-time CLI: returns true
// if any row matches the URL exactly. Callers that want fuzzier
// matching should normalise both sides themselves.
export async function homepageExists(homepage: string): Promise<boolean> {
  const rows = await db
    .select({ exists: sql<number>`1` })
    .from(friend)
    .where(eq(friend.homepage, homepage))
    .limit(1)
  return rows.length > 0
}
