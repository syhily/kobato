import type { Database } from '@kobato/db/database'
import type { LoginMethod } from '@kobato/db/schema/user'
import type { NewUser, User } from '@kobato/db/types'
import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite'

import { sqliteOf } from '@kobato/db/database'
import { setting } from '@kobato/db/schema/config'
import { user, verification } from '@kobato/db/schema/user'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters'
import bcrypt from 'bcryptjs'
import { and, count, eq, inArray, isNull, ne, or } from 'drizzle-orm'

export type SafeUser = Omit<User, 'password' | 'lastIp' | 'lastUa'>

export const PASSWORD_HASH_ROUNDS = 12

const DUMMY_HASH = '$2b$12$EIX9MbHN0xG0yKqfNR4XPezHbhVzQzMn/37uD.LR8VgNTbQjD/II.'

export async function hasAdmin(db: Database): Promise<boolean> {
  const res = await sqliteOf(db)
    .select({ count: count() })
    .from(user)
    .where(and(eq(user.role, 'admin'), isNull(user.deletedAt)))
  return res.length > 0 && res[0].count > 0
}

export async function findFirstAdminUser(db: Database): Promise<User | null> {
  const rows = await sqliteOf(db)
    .select()
    .from(user)
    .where(and(eq(user.role, 'admin'), isNull(user.deletedAt)))
    .limit(1)
  return rows[0] ?? null
}

export async function findUserByEmail(db: Database, email: string): Promise<User | null> {
  const rows = await sqliteOf(db).select().from(user).where(eq(user.email, email)).limit(1)
  return rows[0] ?? null
}

export async function findUserById(db: Database, id: number): Promise<User | null> {
  const rows = await sqliteOf(db).select().from(user).where(eq(user.id, id)).limit(1)
  return rows[0] ?? null
}

export function findUserByIdForUpdate(db: Database, id: number): User | null {
  const rows = sqliteOf(db).select().from(user).where(eq(user.id, id)).limit(1).all()
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
  loginMethod: user.loginMethod,
}

export async function findSafeUserByEmail(db: Database, email: string): Promise<SafeUser | null> {
  const rows = await sqliteOf(db).select(safeUserColumns).from(user).where(eq(user.email, email)).limit(1)
  return rows[0] ?? null
}

export async function findSafeUserById(db: Database, id: number): Promise<SafeUser | null> {
  const rows = await sqliteOf(db).select(safeUserColumns).from(user).where(eq(user.id, id)).limit(1)
  return rows[0] ?? null
}

export async function hasRegisteredAccount(db: Database, email: string): Promise<boolean> {
  const rows = await sqliteOf(db)
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.email, email), ne(user.password, ''), isNull(user.deletedAt)))
    .limit(1)
  return rows.length > 0
}

export async function findUsersByIds(db: Database, ids: number[]): Promise<User[]> {
  if (ids.length === 0) {
    return []
  }
  return sqliteOf(db).select().from(user).where(inArray(user.id, ids))
}

function timingFuzz(): Promise<void> {
  const ms = 50 + Math.floor(Math.random() * 150)
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function verifyUserPassword(db: Database, email: string, password: string): Promise<User | null> {
  const u = await findUserByEmail(db, email)
  if (u?.deletedAt !== null || u.password === null || u.password === '') {
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

export async function findEmailById(db: Database, id: number): Promise<string | null> {
  const rows = await sqliteOf(db).select({ email: user.email }).from(user).where(eq(user.id, id)).limit(1)
  return rows[0]?.email ?? null
}

export interface InsertAdminOptions {
  link?: string
}

export async function hashAdminPassword(password: string): Promise<string> {
  return bcrypt.hash(password, PASSWORD_HASH_ROUNDS)
}

export function insertAdmin(
  db: Database,
  name: string,
  email: string,
  hashedPassword: string,
  options: InsertAdminOptions = {},
): SafeUser[] {
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
  return sqliteOf(db).insert(user).values(admin).returning(safeUserColumns).all()
}

export function insertAuthor(db: Database, name: string, email: string): User[] {
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
  return sqliteOf(db).insert(user).values(author).returning().all()
}

export async function insertCommentUser(
  db: Database,
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
  const res = await sqliteOf(db).insert(user).values(u).returning(safeUserColumns)
  return res[0] ?? null
}

export async function updateLastLogin(db: Database, id: number, ip: string, userAgent: string | null): Promise<void> {
  await sqliteOf(db).update(user).set({ lastIp: ip, lastUa: userAgent }).where(eq(user.id, id))
}

export interface UserUpdate {
  name?: string
  email?: string
  link?: string | null
  password?: string
  role?: 'admin' | 'author' | 'visitor' | null
  badgeName?: string | null
  badgeColor?: string | null
  badgeTextColor?: string | null
  receiveEmail?: boolean
  loginMethod?: LoginMethod
}

const BCRYPT_HASH_RE = /^\$2[aby]?\$\d+\$/

export async function updateUserById(db: Database, id: number, patch: UserUpdate): Promise<User | null> {
  if (patch.password !== undefined && patch.password !== '' && !BCRYPT_HASH_RE.test(patch.password)) {
    throw new Error('updateUserById: password must be a bcrypt hash, not plaintext')
  }
  const updated = await sqliteOf(db).update(user).set(patch).where(eq(user.id, id)).returning()
  return updated[0] ?? null
}

export function softDeleteUserById(db: Database, id: number): boolean {
  const updated = sqliteOf(db)
    .update(user)
    .set({ deletedAt: new Date() })
    .where(and(eq(user.id, id), isNull(user.deletedAt)))
    .returning({ id: user.id })
    .all()
  return updated.length > 0
}

export async function restoreUserById(db: Database, id: number): Promise<boolean> {
  const updated = await sqliteOf(db)
    .update(user)
    .set({ deletedAt: null })
    .where(eq(user.id, id))
    .returning({ id: user.id })
  return updated.length > 0
}

export async function setUserMuted(db: Database, id: number, muted: boolean): Promise<User | null> {
  const updated = await sqliteOf(db)
    .update(user)
    .set({ isMuted: muted })
    .where(and(eq(user.id, id), or(isNull(user.role), ne(user.role, 'admin'))))
    .returning()
  return updated[0] ?? null
}

export function countAdmins(db: Database): number {
  const rows = sqliteOf(db)
    .select({ count: count() })
    .from(user)
    .where(and(eq(user.role, 'admin'), isNull(user.deletedAt)))
    .all()
  return rows[0]?.count ?? 0
}

export function updateUserRole(db: Database, id: number, role: 'admin' | 'author' | 'visitor' | null): User | null {
  const updated = sqliteOf(db).update(user).set({ role }).where(eq(user.id, id)).returning().all()
  return updated[0] ?? null
}

export async function countUsers(db: Database): Promise<number> {
  const rows = await sqliteOf(db).select({ count: count() }).from(user)
  return rows[0]?.count ?? 0
}

export type UserRoleUpdateOutcome =
  | { outcome: 'not-found' }
  | { outcome: 'sole-admin' }
  | { outcome: 'updated'; user: User; previousRole: User['role'] }

function adminCountTx(tx: NodeSQLiteDatabase): number {
  const rows = tx
    .select({ count: count() })
    .from(user)
    .where(and(eq(user.role, 'admin'), isNull(user.deletedAt)))
    .all()
  return rows[0]?.count ?? 0
}

/**
 * Changes a user's role in one transaction, guarding the last remaining admin against demotion. Business error
 * mapping (which descriptor to surface) stays with the caller.
 */
export function changeUserRoleGuarded(
  db: Database,
  targetId: number,
  newRole: 'admin' | 'author' | 'visitor' | null,
): UserRoleUpdateOutcome {
  return sqliteOf(db).transaction((tx) => {
    const target = tx.select().from(user).where(eq(user.id, targetId)).limit(1).all()[0]
    if (!target) {
      return { outcome: 'not-found' } as const
    }
    if (target.role === 'admin' && newRole !== 'admin' && adminCountTx(tx) <= 1) {
      return { outcome: 'sole-admin' } as const
    }
    const updated = tx.update(user).set({ role: newRole }).where(eq(user.id, targetId)).returning().all()[0]
    return updated
      ? ({ outcome: 'updated', user: updated, previousRole: target.role } as const)
      : ({ outcome: 'not-found' } as const)
  })
}

export type UserDeletionOutcome =
  | { outcome: 'not-found' }
  | { outcome: 'sole-admin' }
  | { outcome: 'deleted'; previousRole: 'admin' | 'author' | 'visitor' | null }

/**
 * Soft-deletes a user in one transaction, guarding the last remaining admin against deletion.
 */
export function softDeleteUserGuarded(db: Database, targetId: number): UserDeletionOutcome {
  return sqliteOf(db).transaction((tx) => {
    const target = tx.select().from(user).where(eq(user.id, targetId)).limit(1).all()[0]
    if (!target) {
      return { outcome: 'not-found' } as const
    }
    if (target.role === 'admin' && adminCountTx(tx) <= 1) {
      return { outcome: 'sole-admin' } as const
    }
    const deleted = tx
      .update(user)
      .set({ deletedAt: new Date() })
      .where(and(eq(user.id, targetId), isNull(user.deletedAt)))
      .returning({ id: user.id })
      .all()
    if (deleted.length === 0) {
      return { outcome: 'not-found' } as const
    }
    return { outcome: 'deleted', previousRole: target.role } as const
  })
}

/**
 * Creates an invited author and their setup token in one transaction so a failure rolls both back.
 */
export function inviteAuthorWithVerification(
  db: Database,
  input: {
    name: string
    email: string
    verification: { id: string; value: string; expiresAt: Date; updatedAt: Date }
  },
): { user: User; tokenExpiresAt: Date } | null {
  return sqliteOf(db).transaction((tx) => {
    const author = tx
      .insert(user)
      .values({
        name: input.name,
        email: input.email,
        emailVerified: false,
        link: '',
        role: 'author',
        password: '',
        badgeName: 'AUTHOR',
        badgeColor: '#007a82',
        receiveEmail: true,
      })
      .returning()
      .all()[0]
    if (!author) {
      return null
    }
    tx.insert(verification)
      .values({
        id: input.verification.id,
        purpose: 'author-invite',
        userId: author.id,
        value: input.verification.value,
        expiresAt: input.verification.expiresAt,
        updatedAt: input.verification.updatedAt,
      })
      .onConflictDoUpdate({
        target: [verification.purpose, verification.userId],
        set: {
          id: input.verification.id,
          value: input.verification.value,
          expiresAt: input.verification.expiresAt,
          updatedAt: input.verification.updatedAt,
        },
      })
      .run()
    return { user: author, tokenExpiresAt: input.verification.expiresAt }
  })
}

/**
 * Creates the first admin and seeds the install settings rows in one transaction (install flow).
 */
export function installInitialAdminWithSections(
  db: Database,
  input: {
    name: string
    email: string
    hashedPassword: string
    sections: Array<{ scope: string; data: Record<string, unknown> }>
  },
): SafeUser | null {
  return sqliteOf(db).transaction((tx) => {
    const users = insertAdmin(db, input.name, input.email, input.hashedPassword)
    const admin = users[0]
    if (!admin) {
      return null
    }
    const updatedBy = admin.id
    const now = new Date()
    for (const section of input.sections) {
      tx.insert(setting)
        .values({ scope: section.scope, data: section.data, updatedAt: now, updatedBy })
        .onConflictDoUpdate({
          target: setting.scope,
          set: { data: section.data, updatedAt: now, updatedBy },
        })
        .run()
    }
    return admin
  })
}
