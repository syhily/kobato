import type { Database } from '@kobato/db/sqlite/database'
import type { NewVerification } from '@kobato/db/sqlite/types'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { verification } from '@kobato/db/sqlite/schema/user'
import { and, eq, lt } from 'drizzle-orm'

export type VerificationPurpose = 'password-reset' | 'author-invite' | 'signin-otp' | 'signin-link'

export interface VerificationTokenRow {
  purpose: string
  userId: number
  expiresAt: Date
}

export function upsertVerification(db: Database, values: NewVerification & { updatedAt: Date }): void {
  sqliteOf(db)
    .insert(verification)
    .values(values)
    .onConflictDoUpdate({
      target: [verification.purpose, verification.userId],
      set: {
        id: values.id,
        value: values.value,
        expiresAt: values.expiresAt,
        updatedAt: values.updatedAt,
      },
    })
    .run()
}

export async function findVerificationByValue(db: Database, value: string): Promise<VerificationTokenRow | null> {
  const rows = await sqliteOf(db)
    .select({
      purpose: verification.purpose,
      userId: verification.userId,
      expiresAt: verification.expiresAt,
    })
    .from(verification)
    .where(eq(verification.value, value))
    .limit(1)
  return rows[0] ?? null
}

export async function consumeVerificationByValue(db: Database, value: string): Promise<VerificationTokenRow | null> {
  const rows = await sqliteOf(db).delete(verification).where(eq(verification.value, value)).returning({
    purpose: verification.purpose,
    userId: verification.userId,
    expiresAt: verification.expiresAt,
  })
  return rows[0] ?? null
}

export async function revokeVerificationsFor(
  db: Database,
  userId: number,
  purpose: VerificationPurpose,
): Promise<void> {
  await sqliteOf(db)
    .delete(verification)
    .where(and(eq(verification.purpose, purpose), eq(verification.userId, userId)))
}

export async function purgeExpiredVerifications(db: Database, olderThan: Date): Promise<number> {
  const result = await sqliteOf(db).delete(verification).where(lt(verification.expiresAt, olderThan))
  return Number(result.changes)
}

export interface OtpConsumption {
  userId: number
}

/**
 * Consumes a sign-in OTP in one transaction: loads the row for `(purpose='signin-otp', userId)`, drops it when
 * expired, and deletes + returns it only when the caller-supplied pure hash predicate accepts the stored value.
 */
export function consumeSignInOtp(
  db: Database,
  userId: number,
  isValidCode: (storedValue: string) => boolean,
): OtpConsumption | null {
  return sqliteOf(db).transaction((tx) => {
    const rows = tx
      .select({
        id: verification.id,
        userId: verification.userId,
        value: verification.value,
        expiresAt: verification.expiresAt,
      })
      .from(verification)
      .where(and(eq(verification.purpose, 'signin-otp'), eq(verification.userId, userId)))
      .limit(1)
      .all()

    const row = rows[0]
    if (!row) {
      return null
    }
    if (row.expiresAt.getTime() < Date.now()) {
      tx.delete(verification).where(eq(verification.id, row.id)).run()
      return null
    }
    if (!isValidCode(row.value)) {
      return null
    }
    tx.delete(verification).where(eq(verification.id, row.id)).run()
    return { userId: row.userId }
  })
}
