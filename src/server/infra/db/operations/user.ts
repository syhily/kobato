import bcrypt from 'bcryptjs'
import { and, count, desc, eq, inArray, isNull, max, ne, or, sql } from 'drizzle-orm'

import type { NewUser, User } from '@/server/infra/db/types'

export type SafeUser = Omit<User, 'password' | 'lastIp' | 'lastUa'>

import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { comment } from '@/server/infra/db/schema/comment'
import { page } from '@/server/infra/db/schema/page'
import { post } from '@/server/infra/db/schema/post'
import { user } from '@/server/infra/db/schema/user'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { escapeLikePattern } from '@/shared/utils/escape-like'

export const PASSWORD_HASH_ROUNDS = 12

export async function hasAdmin(db: NodePgDatabase): Promise<boolean> {
  const res = await db
    .select({ count: count() })
    .from(user)
    .where(and(eq(user.role, 'admin'), isNull(user.deletedAt)))
  return res.length > 0 && res[0].count > 0
}

export async function findFirstAdminUser(db: NodePgDatabase): Promise<User | null> {
  const rows = await db
    .select()
    .from(user)
    .where(and(eq(user.role, 'admin'), isNull(user.deletedAt)))
    .limit(1)
  return rows[0] ?? null
}

export async function findUserByEmail(db: NodePgDatabase, email: string): Promise<User | null> {
  const rows = await db.select().from(user).where(eq(user.email, email)).limit(1)
  return rows[0] ?? null
}

export async function findUserById(db: NodePgDatabase, id: bigint): Promise<User | null> {
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

export async function findSafeUserByEmail(db: NodePgDatabase, email: string): Promise<SafeUser | null> {
  const rows = await db.select(safeUserColumns).from(user).where(eq(user.email, email)).limit(1)
  return rows[0] ?? null
}

export async function findSafeUserById(db: NodePgDatabase, id: bigint): Promise<SafeUser | null> {
  const rows = await db.select(safeUserColumns).from(user).where(eq(user.id, id)).limit(1)
  return rows[0] ?? null
}

export async function hasRegisteredAccount(db: NodePgDatabase, email: string): Promise<boolean> {
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
export async function findUsersByIds(db: NodePgDatabase, ids: bigint[]): Promise<User[]> {
  if (ids.length === 0) {
    return []
  }
  return db.select().from(user).where(inArray(user.id, ids))
}

export async function verifyUserPassword(db: NodePgDatabase, email: string, password: string): Promise<User | null> {
  const u = await findUserByEmail(db, email)
  if (u === null) {
    return null
  }
  return (await bcrypt.compare(password, u.password)) ? u : null
}

export async function findUserIdByEmail(db: NodePgDatabase, email: string): Promise<string | null> {
  const rows = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1)
  return rows[0] ? `${rows[0].id}` : null
}

export async function findEmailById(db: NodePgDatabase, id: bigint): Promise<string | null> {
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
  db: NodePgDatabase,
  name: string,
  email: string,
  password: string,
  options: InsertAdminOptions = {},
): Promise<SafeUser[]> {
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
  return db.insert(user).values(admin).returning(safeUserColumns)
}

export async function insertAuthor(db: NodePgDatabase, name: string, email: string): Promise<User[]> {
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

export async function insertCommentUser(
  db: NodePgDatabase,
  name: string,
  email: string,
  website: string,
): Promise<SafeUser | null> {
  const existing = await findSafeUserByEmail(db, email)
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

export async function updateLastLogin(
  db: NodePgDatabase,
  id: bigint,
  ip: string,
  userAgent: string | null,
): Promise<void> {
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

const BCRYPT_HASH_RE = /^\$2[aby]?\$\d+\$/

export async function updateUserById(db: NodePgDatabase, id: bigint, patch: UserUpdate): Promise<User | null> {
  // Defensive: reject plaintext passwords that were not pre-hashed.
  // Callers that intend to change a password must hash it with bcrypt
  // before passing it here.
  if (patch.password !== undefined && patch.password !== '' && !BCRYPT_HASH_RE.test(patch.password)) {
    throw new Error('updateUserById: password must be a bcrypt hash, not plaintext')
  }
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
  hasPages?: boolean
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
  if (filters.hasPages) {
    conditions.push(sql`EXISTS (SELECT 1 FROM ${page} WHERE ${eq(page.authorId, user.id)})`)
  }
  return conditions
}

export async function countAdminUsers(db: NodePgDatabase, filters: AdminUsersListFilters): Promise<number> {
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
  db: NodePgDatabase,
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

export async function findAdminUserById(db: NodePgDatabase, id: bigint): Promise<AdminUserRow | null> {
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

export async function softDeleteUserById(db: NodePgDatabase, id: bigint): Promise<boolean> {
  const updated = await db
    .update(user)
    .set({ deletedAt: new Date() })
    .where(and(eq(user.id, id), isNull(user.deletedAt)))
    .returning({ id: user.id })
  return updated.length > 0
}

export async function restoreUserById(db: NodePgDatabase, id: bigint): Promise<boolean> {
  const updated = await db.update(user).set({ deletedAt: null }).where(eq(user.id, id)).returning({ id: user.id })
  return updated.length > 0
}

export async function setUserMuted(db: NodePgDatabase, id: bigint, muted: boolean): Promise<User | null> {
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

export async function countAdmins(db: NodePgDatabase): Promise<number> {
  const rows = await db.select({ count: count() }).from(user).where(eq(user.role, 'admin'))
  return rows[0]?.count ?? 0
}

export async function updateUserRole(
  db: NodePgDatabase,
  id: bigint,
  role: 'admin' | 'author' | 'visitor' | null,
): Promise<User | null> {
  const updated = await db.update(user).set({ role }).where(eq(user.id, id)).returning()
  return updated[0] ?? null
}

export async function countUsers(db: NodePgDatabase): Promise<number> {
  const rows = await db.select({ count: count() }).from(user)
  return rows[0]?.count ?? 0
}
