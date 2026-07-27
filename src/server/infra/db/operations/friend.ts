import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { count, desc, eq, or, type SQL } from 'drizzle-orm'

import type { FriendRow, NewFriend } from '@/server/infra/db/types'

import { ilikeEscape } from '@/server/infra/db/ilike-escape'
import { applyPage, assembleWhere } from '@/server/infra/db/operations/admin-list'
import { friend } from '@/server/infra/db/schema/friend'

// Stable ascending id ordering for the public catalog. Output flows
// through `hydrateFriendImages()`, and the `<Friends />` PortableText
// block's own shuffle decides the renderer-visible order — the SQL
// `ORDER BY` exists only so thumbhash hydration produces deterministic
// per-deploy resolution order, which keeps the in-process inflight
// cache hot across reloads.
export async function listPublicFriendRows(db: NodePgDatabase): Promise<FriendRow[]> {
  return db.select().from(friend).where(eq(friend.visible, true)).orderBy(friend.id)
}

export interface AdminFriendsListFilters {
  q?: string
  includeHidden?: boolean
  /**
   * Exact visibility match. When set, takes precedence over
   * `includeHidden` — the pending-review bucket uses `visible: false`
   * to list only hidden rows (which `includeHidden: true` cannot
   * express, since it returns both buckets).
   */
  visible?: boolean
  /** Zero-based offset for pagination. Defaults to 0 when undefined. */
  offset?: number
  /** Page size. When undefined, all matching rows are returned. */
  limit?: number
}

// Build the shared conditions used by both `listAdminFriendRows`
// and `countAdminFriends`. Keeping construction in one place ensures
// the row listing and the pagination counter always filter on the
// same predicate; if they drifted, `total` would be inconsistent
// with the returned page (and `hasMore` would lie). The
// conditions-array → `WHERE` assembly is shared with the other admin
// lists via `assembleWhere()`.
function buildAdminFriendConditions(filters: AdminFriendsListFilters): SQL[] {
  const conditions: SQL[] = []
  if (filters.visible !== undefined) {
    conditions.push(eq(friend.visible, filters.visible))
  } else if (!filters.includeHidden) {
    conditions.push(eq(friend.visible, true))
  }
  if (filters.q && filters.q.trim() !== '') {
    const q = filters.q.trim()
    const search = or(
      ilikeEscape(friend.website, q),
      ilikeEscape(friend.description, q),
      ilikeEscape(friend.homepage, q),
    )
    if (search) {
      conditions.push(search)
    }
  }
  return conditions
}

// Admin list view. Newest entries surface first so the most recently
// added friend is one click away. The optional `q` matches against
// `website`, `description`, and `homepage` with case-insensitive
// `ILIKE` so admins can find a row by either the display name or the
// URL. `includeHidden` flips whether `visible=false` rows appear; the
// default mirrors the public site (visible only). When `offset` /
// `limit` are supplied we paginate server-side.
export async function listAdminFriendRows(
  db: NodePgDatabase,
  filters: AdminFriendsListFilters = {},
): Promise<FriendRow[]> {
  const where = assembleWhere(buildAdminFriendConditions(filters))
  const q = where
    ? db.select().from(friend).where(where).orderBy(desc(friend.createdAt))
    : db.select().from(friend).orderBy(desc(friend.createdAt))
  return applyPage(q, filters)
}

// Pagination counter. Returns the total number of rows matching the
// same `q` + `includeHidden` filter `listAdminFriendRows` uses,
// ignoring `offset`/`limit`. Powers the `total` field of the admin
// list response so the table's pagination control can render the
// right number of pages.
export async function countAdminFriends(db: NodePgDatabase, filters: AdminFriendsListFilters = {}): Promise<number> {
  const where = assembleWhere(buildAdminFriendConditions(filters))
  const rows = where
    ? await db.select({ value: count() }).from(friend).where(where)
    : await db.select({ value: count() }).from(friend)
  return rows[0]?.value ?? 0
}

export async function findFriendById(db: NodePgDatabase, id: bigint): Promise<FriendRow | null> {
  const rows = await db.select().from(friend).where(eq(friend.id, id)).limit(1)
  return rows[0] ?? null
}

export async function findFriendByHomepage(db: NodePgDatabase, homepage: string): Promise<FriendRow | null> {
  const rows = await db.select().from(friend).where(eq(friend.homepage, homepage)).limit(1)
  return rows[0] ?? null
}

export async function insertFriend(db: NodePgDatabase, values: NewFriend): Promise<FriendRow> {
  const now = new Date()
  const rows = await db
    .insert(friend)
    .values({ ...values, createdAt: now, updatedAt: now })
    .returning()
  return rows[0]
}

export async function updateFriend(
  db: NodePgDatabase,
  id: bigint,
  values: Partial<NewFriend>,
): Promise<FriendRow | null> {
  const rows = await db
    .update(friend)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(friend.id, id))
    .returning()
  return rows[0] ?? null
}

export async function deleteFriend(db: NodePgDatabase, id: bigint): Promise<boolean> {
  const result = await db.delete(friend).where(eq(friend.id, id)).returning({ id: friend.id })
  return result.length > 0
}
