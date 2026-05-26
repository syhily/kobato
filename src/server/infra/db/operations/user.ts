import bcrypt from 'bcryptjs'
import { and, count, desc, eq, inArray, isNull, max, ne, or, sql } from 'drizzle-orm'

import type { NewUser, User } from '@/server/infra/db/types'

export type SafeUser = Omit<User, 'password' | 'lastIp' | 'lastUa'>

import { db } from '@/server/infra/db/pool'
import { comment } from '@/server/infra/db/schema/comment'
import { post } from '@/server/infra/db/schema/post'
import { user } from '@/server/infra/db/schema/user'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { escapeLikePattern } from '@/shared/utils/escape-like'

export const PASSWORD_HASH_ROUNDS = 12

export async function hasAdmin(): Promise<boolean> {
  const res = await db
    .select({ count: count() })
    .from(user)
    .where(and(eq(user.role, 'admin'), isNull(user.deletedAt)))
  return res.length > 0 && res[0].count > 0
}

export async function findFirstAdminUser(): Promise<User | null> {
  const rows = await db
    .select()
    .from(user)
    .where(and(eq(user.role, 'admin'), isNull(user.deletedAt)))
    .limit(1)
  return rows[0] ?? null
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const rows = await db.select().from(user).where(eq(user.email, email)).limit(1)
  return rows[0] ?? null
}

export async function findUserById(id: bigint): Promise<User | null> {
  const rows = await db.select().from(user).where(eq(user.id, id)).limit(1)
  return rows[0] ?? null
}

const safeUserColumns = {
  id: user.id,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  deletedAt: user.deletedAt,
  name: user.name,
  email: user.email,
  emailVerified: user.emailVerified,
  link: user.link,
  badgeName: user.badgeName,
  badgeColor: user.badgeColor,
  badgeTextColor: user.badgeTextColor,
  role: user.role,
  isMuted: user.isMuted,
  receiveEmail: user.receiveEmail,
}

export async function findSafeUserByEmail(email: string): Promise<SafeUser | null> {
  const rows = await db.select(safeUserColumns).from(user).where(eq(user.email, email)).limit(1)
  return rows[0] ?? null
}

export async function findSafeUserById(id: bigint): Promise<SafeUser | null> {
  const rows = await db.select(safeUserColumns).from(user).where(eq(user.id, id)).limit(1)
  return rows[0] ?? null
}

export async function hasRegisteredAccount(email: string): Promise<boolean> {
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.email, email), ne(user.password, '')))
    .limit(1)
  return rows.length > 0
}

/**
 * Bulk fetch of users by id list. Used by the admin session-management
 * view to join `session_meta:<sid>` records against the `user` table in
 * a single round trip. Returns rows in whatever order Postgres picks —
 * the caller indexes by `id` rather than relying on input order.
 */
export async function findUsersByIds(ids: bigint[]): Promise<User[]> {
  if (ids.length === 0) {
    return []
  }
  return db.select().from(user).where(inArray(user.id, ids))
}

export async function verifyUserPassword(email: string, password: string): Promise<User | null> {
  const u = await findUserByEmail(email)
  if (u === null) {
    return null
  }
  return (await bcrypt.compare(password, u.password)) ? u : null
}

export async function findUserIdByEmail(email: string): Promise<string | null> {
  const rows = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1)
  return rows[0] ? `${rows[0].id}` : null
}

export async function findEmailById(id: bigint): Promise<string | null> {
  const rows = await db.select({ email: user.email }).from(user).where(eq(user.id, id)).limit(1)
  return rows[0]?.email ?? null
}

export interface InsertAdminOptions {
  /**
   * Optional homepage URL stored on the admin row. The install flow
   * threads in the freshly-collected `website` field directly because
   * the settings snapshot has not been written yet at that point. Other
   * call sites (none today, but kept for symmetry) can omit this and
   * fall back to the snapshot value, ultimately the empty string.
   */
  link?: string
}

export async function insertAdmin(
  name: string,
  email: string,
  password: string,
  options: InsertAdminOptions = {},
): Promise<User[]> {
  const hashedPassword = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS)
  const admin: NewUser = {
    name,
    email,
    emailVerified: false,
    // The install flow passes `link` explicitly because the settings
    // snapshot is not hydrated yet. Other callers fall back to the
    // already-installed `website` value (or empty string pre-install).
    link: options.link ?? getBlogSettingsBundleSync()?.siteIdentity?.website ?? '',
    role: 'admin',
    password: hashedPassword,
    badgeName: 'MOD',
    badgeColor: '#008c95',
    receiveEmail: true,
  }
  return db.insert(user).values(admin).returning()
}

export async function insertAuthor(name: string, email: string): Promise<User[]> {
  const author: NewUser = {
    name,
    email,
    emailVerified: false,
    link: '',
    role: 'author',
    password: '',
    badgeName: 'AUTHOR',
    badgeColor: '#008c95',
    receiveEmail: true,
  }
  return db.insert(user).values(author).returning()
}

export async function insertCommentUser(name: string, email: string, website: string): Promise<SafeUser | null> {
  const existing = await findSafeUserByEmail(email)
  if (existing !== null) {
    return existing
  }
  const u: NewUser = {
    name,
    email,
    emailVerified: false,
    link: website,
    password: '',
    badgeName: '',
    badgeColor: '',
    receiveEmail: true,
  }
  const res = await db.insert(user).values(u).returning(safeUserColumns)
  return res[0] ?? null
}

export async function updateLastLogin(id: bigint, ip: string, userAgent: string | null): Promise<void> {
  await db.update(user).set({ lastIp: ip, lastUa: userAgent }).where(eq(user.id, id))
}

export interface UserUpdate {
  name?: string
  email?: string
  link?: string
  password?: string
  role?: 'admin' | 'author' | 'visitor' | null
  badgeName?: string
  badgeColor?: string
  // `null` clears the manual override and reactivates the auto-derived
  // contrast pick (see `commentBadgeTextColor`); a non-null hex string
  // pins the badge text colour verbatim. Distinct from `undefined`
  // (which means "do not touch the column on this update").
  badgeTextColor?: string | null
  receiveEmail?: boolean
}

export async function updateUserById(id: bigint, patch: UserUpdate): Promise<User | null> {
  const updated = await db.update(user).set(patch).where(eq(user.id, id)).returning()
  return updated[0] ?? null
}

// --- Admin user-management helpers ----------------------------------------
//
// Everything below this line is consumed by the admin SPA only. The
// public site never references these helpers, so they can evolve
// independently without worrying about the public bundle surface.

export type UserRoleFilter = 'all' | 'admin' | 'author' | 'visitor' | 'normal'

export interface AdminUsersListFilters {
  q?: string
  role?: UserRoleFilter
  includeDeleted?: boolean
  hasPosts?: boolean
}

export interface AdminUserRow {
  id: bigint
  name: string
  email: string
  link: string | null
  badgeName: string | null
  badgeColor: string | null
  badgeTextColor: string | null
  role: 'admin' | 'author' | 'visitor' | null
  isMuted: boolean
  emailVerified: boolean
  createdAt: Date
  deletedAt: Date | null
  lastIp: string | null
  lastUa: string | null
  commentCount: number
  pendingCount: number
  lastCommentAt: Date | null
}

function buildAdminUsersConditions(filters: AdminUsersListFilters) {
  const conditions = []
  if (!filters.includeDeleted) {
    conditions.push(isNull(user.deletedAt))
  }
  if (filters.role === 'admin') {
    conditions.push(eq(user.role, 'admin'))
  } else if (filters.role === 'author') {
    conditions.push(eq(user.role, 'author'))
  } else if (filters.role === 'visitor') {
    conditions.push(eq(user.role, 'visitor'))
  } else if (filters.role === 'normal') {
    // Non-admin users: author, visitor, or role-less anonymous.
    conditions.push(or(eq(user.role, 'author'), eq(user.role, 'visitor'), isNull(user.role)))
  }
  if (filters.q && filters.q.trim() !== '') {
    const like = `%${escapeLikePattern(filters.q.trim())}%`
    conditions.push(or(sql`${user.name} ILIKE ${like}`, sql`${user.email} ILIKE ${like}`))
  }
  if (filters.hasPosts) {
    conditions.push(sql`EXISTS (SELECT 1 FROM ${post} WHERE ${eq(post.authorId, user.id)})`)
  }
  return conditions
}

export async function countAdminUsers(filters: AdminUsersListFilters): Promise<number> {
  const conditions = buildAdminUsersConditions(filters)
  const rows = await db
    .select({ counts: count() })
    .from(user)
    .where(conditions.length ? and(...conditions) : undefined)
  return rows[0]?.counts ?? 0
}

export type AdminUsersSortOrder = 'recent' | 'commentCount'

// Drizzle 1.0 wires aggregate functions (`max`, `min`, …) to call
// `column.mapFromDriverValue()` on the result. `PgTimestamp` does not
// override that hook — its driver-value normalisation lives on the
// dialect codec layer instead, which the aggregate path bypasses. The
// `node-postgres` session also disables pg's built-in TIMESTAMP/TIMESTAMPTZ
// type parsers (so the column codec layer can handle them uniformly), so
// without this coercion the raw text from pg leaks all the way out to
// callers that expect a `Date` (manifesting as
// `lastCommentAt.toISOString is not a function`). A fresh SQL fragment is
// returned per call to avoid sharing decoder state across query builds.
function lastCommentAtAggregate() {
  return max(comment.createdAt).mapWith((value: Date | string) => (value instanceof Date ? value : new Date(value)))
}

export async function listAdminUsers(
  offset: number,
  limit: number,
  filters: AdminUsersListFilters,
  sortBy: AdminUsersSortOrder = 'recent',
): Promise<AdminUserRow[]> {
  const conditions = buildAdminUsersConditions(filters)
  // Aggregate comment counts and last-comment timestamp per user via a
  // single LEFT JOIN + GROUP BY, so the listing query stays at one
  // round-trip even with the comment metadata columns.
  //
  // The aggregated `commentCount` column is reused by the optional
  // `commentCount` sort below — we name it explicitly with `sql.raw` so
  // we can ORDER BY the alias instead of repeating the FILTER clause
  // (PostgreSQL accepts `ORDER BY <alias>` after `GROUP BY`).
  const commentCountSql = sql<number>`COUNT(${comment.id}) FILTER (WHERE ${comment.deletedAt} IS NULL)`
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      link: user.link,
      badgeName: user.badgeName,
      badgeColor: user.badgeColor,
      badgeTextColor: user.badgeTextColor,
      role: user.role,
      isMuted: user.isMuted,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      deletedAt: user.deletedAt,
      lastIp: user.lastIp,
      lastUa: user.lastUa,
      commentCount: commentCountSql,
      pendingCount: sql<number>`COUNT(${comment.id}) FILTER (WHERE ${comment.deletedAt} IS NULL AND ${comment.isPending} = TRUE)`,
      lastCommentAt: lastCommentAtAggregate(),
    })
    .from(user)
    .leftJoin(comment, eq(comment.userId, user.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(user.id)
    // Tiebreak with `user.id` desc in both modes so paginated results
    // stay deterministic when several users share the same primary key
    // (zero comments → identical `commentCount`; identical createdAt).
    .orderBy(
      ...(sortBy === 'commentCount' ? [desc(commentCountSql), desc(user.id)] : [desc(user.createdAt), desc(user.id)]),
    )
    .limit(limit)
    .offset(offset)

  return rows.map((row) => ({
    ...row,
    role: row.role ?? null,
    commentCount: Number(row.commentCount ?? 0),
    pendingCount: Number(row.pendingCount ?? 0),
  }))
}

export async function findAdminUserById(id: bigint): Promise<AdminUserRow | null> {
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      link: user.link,
      badgeName: user.badgeName,
      badgeColor: user.badgeColor,
      badgeTextColor: user.badgeTextColor,
      role: user.role,
      isMuted: user.isMuted,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      deletedAt: user.deletedAt,
      lastIp: user.lastIp,
      lastUa: user.lastUa,
      commentCount: sql<number>`COUNT(${comment.id}) FILTER (WHERE ${comment.deletedAt} IS NULL)`,
      pendingCount: sql<number>`COUNT(${comment.id}) FILTER (WHERE ${comment.deletedAt} IS NULL AND ${comment.isPending} = TRUE)`,
      lastCommentAt: lastCommentAtAggregate(),
    })
    .from(user)
    .leftJoin(comment, eq(comment.userId, user.id))
    .where(eq(user.id, id))
    .groupBy(user.id)
    .limit(1)
  const row = rows[0]
  if (!row) {
    return null
  }
  return {
    ...row,
    role: row.role ?? null,
    commentCount: Number(row.commentCount ?? 0),
    pendingCount: Number(row.pendingCount ?? 0),
  }
}

export async function softDeleteUserById(id: bigint): Promise<boolean> {
  const updated = await db
    .update(user)
    .set({ deletedAt: new Date() })
    .where(and(eq(user.id, id), isNull(user.deletedAt)))
    .returning({ id: user.id })
  return updated.length > 0
}

export async function restoreUserById(id: bigint): Promise<boolean> {
  const updated = await db.update(user).set({ deletedAt: null }).where(eq(user.id, id)).returning({ id: user.id })
  return updated.length > 0
}

export async function setUserMuted(id: bigint, muted: boolean): Promise<User | null> {
  // Admins are exempt from muting; the admin UI hides the action, but
  // this guard makes the rule explicit at the storage boundary so it
  // cannot be bypassed by a hand-crafted API request. Reverse-asserts
  // on `role != 'admin'` so future roles (e.g. `editor`) inherit the
  // mute-eligibility without a one-by-one update here.
  const updated = await db
    .update(user)
    .set({ isMuted: muted })
    .where(and(eq(user.id, id), or(isNull(user.role), ne(user.role, 'admin'))))
    .returning()
  return updated[0] ?? null
}

export async function countAdmins(): Promise<number> {
  const rows = await db.select({ count: count() }).from(user).where(eq(user.role, 'admin'))
  return rows[0]?.count ?? 0
}

export async function updateUserRole(id: bigint, role: 'admin' | 'author' | 'visitor' | null): Promise<User | null> {
  const updated = await db.update(user).set({ role }).where(eq(user.id, id)).returning()
  return updated[0] ?? null
}

export async function countUsers(): Promise<number> {
  const rows = await db.select({ count: count() }).from(user)
  return rows[0]?.count ?? 0
}
