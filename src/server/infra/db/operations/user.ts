import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import bcrypt from 'bcryptjs'
import { and, count, eq, inArray, isNull, ne, or } from 'drizzle-orm'

import type { NewUser, User } from '@/server/infra/db/types'

import { user } from '@/server/infra/db/schema/user'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

export type SafeUser = Omit<User, 'password' | 'lastIp' | 'lastUa'>

export const PASSWORD_HASH_ROUNDS = 12

const DUMMY_HASH = '$2b$12$EIX9MbHN0xG0yKqfNR4XPezHbhVzQzMn/37uD.LR8VgNTbQjD/II.'

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
  passkeyForce: user.passkeyForce,
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
    .where(and(eq(user.email, email), ne(user.password, ''), isNull(user.deletedAt)))
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

function timingFuzz(): Promise<void> {
  const ms = 50 + Math.floor(Math.random() * 150)
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function verifyUserPassword(db: NodePgDatabase, email: string, password: string): Promise<User | null> {
  const u = await findUserByEmail(db, email)
  if (u === null || u.deletedAt !== null || u.password === null || u.password === '') {
    await bcrypt.compare('dummy', DUMMY_HASH)
    await timingFuzz()
    return null
  }
  const ok = await bcrypt.compare(password, u.password)
  if (!ok) {
    await timingFuzz()
  }
  return ok ? u : null
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
    link: options.link ?? getBlogSettingsBundleSync()?.siteIdentity?.website ?? '',
    role: 'admin',
    password: hashedPassword,
    badgeName: 'MOD',
    badgeColor: '#007a82',
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
    badgeColor: '#007a82',
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
  passkeyForce?: boolean
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
  const updated = await db
    .update(user)
    .set({ isMuted: muted })
    .where(and(eq(user.id, id), or(isNull(user.role), ne(user.role, 'admin'))))
    .returning()
  return updated[0] ?? null
}

export async function countAdmins(db: NodePgDatabase): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(user)
    .where(and(eq(user.role, 'admin'), isNull(user.deletedAt)))
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
