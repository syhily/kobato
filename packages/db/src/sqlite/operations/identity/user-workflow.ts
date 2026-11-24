import type { Database } from '@kobato/db/sqlite/database'
import type { SafeUser } from '@kobato/db/sqlite/operations/identity/user'
import type { User } from '@kobato/db/sqlite/types'
import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { insertAdmin } from '@kobato/db/sqlite/operations/identity/user'
import { setting } from '@kobato/db/sqlite/schema/config'
import { user, verification } from '@kobato/db/sqlite/schema/user'
import { and, count, eq, isNull } from 'drizzle-orm'

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
