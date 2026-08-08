import { count, desc, eq, or, type SQL } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { FriendRow, NewFriend } from '@/server/infra/db/types'

import { likeEscape } from '@/server/infra/db/like-escape'
import { applyPage, assembleWhere } from '@/server/infra/db/operations/admin-list'
import { friend } from '@/server/infra/db/schema/friend'

// Stable id order so thumbhash hydration resolves deterministically; the
// `<Friends />` block's shuffle owns the renderer-visible order.
export async function listPublicFriendRows(db: Database): Promise<FriendRow[]> {
  return db.select().from(friend).where(eq(friend.visible, true)).orderBy(friend.id)
}

export interface AdminFriendsListFilters {
  q?: string
  includeHidden?: boolean
  /**
   * Exact visibility match; takes precedence over `includeHidden` (so the
   * pending-review bucket can list only `visible: false` rows).
   */
  visible?: boolean
  /** Zero-based offset for pagination. Defaults to 0 when undefined. */
  offset?: number
  /** Page size. When undefined, all matching rows are returned. */
  limit?: number
}

// Shared by the listing and its counter so both filter on the same predicate.
function buildAdminFriendConditions(filters: AdminFriendsListFilters): SQL[] {
  const conditions: SQL[] = []
  if (filters.visible !== undefined) {
    conditions.push(eq(friend.visible, filters.visible))
  } else if (!filters.includeHidden) {
    conditions.push(eq(friend.visible, true))
  }
  if (filters.q && filters.q.trim() !== '') {
    const q = filters.q.trim()
    const search = or(likeEscape(friend.website, q), likeEscape(friend.description, q), likeEscape(friend.homepage, q))
    if (search) {
      conditions.push(search)
    }
  }
  return conditions
}

// Admin list view; newest first; `includeHidden` admits `visible=false` rows.
export async function listAdminFriendRows(db: Database, filters: AdminFriendsListFilters = {}): Promise<FriendRow[]> {
  const where = assembleWhere(buildAdminFriendConditions(filters))
  const q = where
    ? db.select().from(friend).where(where).orderBy(desc(friend.createdAt))
    : db.select().from(friend).orderBy(desc(friend.createdAt))
  return applyPage(q, filters)
}

// Counter: same filter as the listing, ignoring offset/limit.
export async function countAdminFriends(db: Database, filters: AdminFriendsListFilters = {}): Promise<number> {
  const where = assembleWhere(buildAdminFriendConditions(filters))
  const rows = where
    ? await db.select({ value: count() }).from(friend).where(where)
    : await db.select({ value: count() }).from(friend)
  return rows[0]?.value ?? 0
}

export async function findFriendById(db: Database, id: number): Promise<FriendRow | null> {
  const rows = await db.select().from(friend).where(eq(friend.id, id)).limit(1)
  return rows[0] ?? null
}

export async function findFriendByHomepage(db: Database, homepage: string): Promise<FriendRow | null> {
  const rows = await db.select().from(friend).where(eq(friend.homepage, homepage)).limit(1)
  return rows[0] ?? null
}

export async function insertFriend(db: Database, values: NewFriend): Promise<FriendRow> {
  const now = new Date()
  const rows = await db
    .insert(friend)
    .values({ ...values, createdAt: now, updatedAt: now })
    .returning()
  return rows[0]
}

export async function updateFriend(db: Database, id: number, values: Partial<NewFriend>): Promise<FriendRow | null> {
  const rows = await db
    .update(friend)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(friend.id, id))
    .returning()
  return rows[0] ?? null
}

export async function deleteFriend(db: Database, id: number): Promise<boolean> {
  const result = await db.delete(friend).where(eq(friend.id, id)).returning({ id: friend.id })
  return result.length > 0
}
