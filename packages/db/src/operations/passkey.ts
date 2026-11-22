import type { Database } from '@kobato/db/database'
import type { LoginMethod } from '@kobato/db/schema/user'
import type { NewPasskeyCredential, PasskeyCredentialRow } from '@kobato/db/types'

import { sqliteOf } from '@kobato/db/database'
import { passkeyCredential } from '@kobato/db/schema/passkey'
import { user } from '@kobato/db/schema/user'
import { and, eq } from 'drizzle-orm'

export interface PasskeyCredentialIdRow {
  credentialId: string
  transports: string[] | null
}

export async function listCredentialIdsForUser(db: Database, userId: number): Promise<PasskeyCredentialIdRow[]> {
  return sqliteOf(db)
    .select({ credentialId: passkeyCredential.credentialId, transports: passkeyCredential.transports })
    .from(passkeyCredential)
    .where(eq(passkeyCredential.userId, userId))
}

export async function findPasskeyByCredentialId(
  db: Database,
  credentialId: string,
): Promise<PasskeyCredentialRow | null> {
  const rows = await sqliteOf(db)
    .select()
    .from(passkeyCredential)
    .where(eq(passkeyCredential.credentialId, credentialId))
    .limit(1)
  return rows[0] ?? null
}

export async function insertPasskeyCredential(
  db: Database,
  values: NewPasskeyCredential,
): Promise<PasskeyCredentialRow | null> {
  const rows = await sqliteOf(db).insert(passkeyCredential).values(values).returning()
  return rows[0] ?? null
}

export async function updatePasskeyCounter(db: Database, id: number, counter: number): Promise<void> {
  await sqliteOf(db)
    .update(passkeyCredential)
    .set({ counter, updatedAt: new Date() })
    .where(eq(passkeyCredential.id, id))
}

export interface PasskeyCredentialMetaRow {
  credentialId: string
  deviceName: string | null
  createdAt: Date
  backedUp: boolean
}

export async function listCredentialMetasForUser(db: Database, userId: number): Promise<PasskeyCredentialMetaRow[]> {
  return sqliteOf(db)
    .select({
      credentialId: passkeyCredential.credentialId,
      deviceName: passkeyCredential.deviceName,
      createdAt: passkeyCredential.createdAt,
      backedUp: passkeyCredential.backedUp,
    })
    .from(passkeyCredential)
    .where(eq(passkeyCredential.userId, userId))
    .orderBy(passkeyCredential.createdAt)
}

export async function deletePasskeyCredential(db: Database, credentialId: string, userId: number): Promise<boolean> {
  const result = await sqliteOf(db)
    .delete(passkeyCredential)
    .where(and(eq(passkeyCredential.credentialId, credentialId), eq(passkeyCredential.userId, userId)))
    .returning({ id: passkeyCredential.id })
  return result.length > 0
}

export async function deleteAllPasskeyCredentialsForUser(db: Database, userId: number): Promise<number> {
  const result = await sqliteOf(db)
    .delete(passkeyCredential)
    .where(eq(passkeyCredential.userId, userId))
    .returning({ id: passkeyCredential.id })
  return result.length
}

/**
 * Drops credentials and, inside the same transaction, reverts the user's `login_method` to `password` when no
 * credential remains. `credentialId` omitted drops every credential of the user.
 */
export function deletePasskeyCredentialsAndMaybeRevertLogin(
  db: Database,
  input: { credentialId?: string; userId: number },
): number {
  return sqliteOf(db).transaction((tx) => {
    const deleted =
      input.credentialId === undefined
        ? tx
            .delete(passkeyCredential)
            .where(eq(passkeyCredential.userId, input.userId))
            .returning({ id: passkeyCredential.id })
            .all()
        : tx
            .delete(passkeyCredential)
            .where(
              and(eq(passkeyCredential.credentialId, input.credentialId), eq(passkeyCredential.userId, input.userId)),
            )
            .returning({ id: passkeyCredential.id })
            .all()
    const singleNoMatch = input.credentialId !== undefined && deleted.length === 0
    if (singleNoMatch) {
      return 0
    }
    const remaining = tx
      .select({ id: passkeyCredential.id })
      .from(passkeyCredential)
      .where(eq(passkeyCredential.userId, input.userId))
      .limit(1)
      .all()
    if (remaining.length === 0) {
      tx.update(user)
        .set({ loginMethod: 'password' })
        .where(and(eq(user.id, input.userId), eq(user.loginMethod, 'passkey')))
        .run()
    }
    return deleted.length
  })
}

/**
 * Switches the login method, requiring at least one credential when switching to passkey.
 */
export function setUserLoginMethod(
  db: Database,
  userId: number,
  method: LoginMethod,
): { ok: boolean; reason?: 'passkey-requires-credential' } {
  const sdb = sqliteOf(db)
  if (method === 'passkey') {
    const credentials = sdb
      .select({ id: passkeyCredential.id })
      .from(passkeyCredential)
      .where(eq(passkeyCredential.userId, userId))
      .limit(1)
      .all()
    if (credentials.length === 0) {
      return { ok: false, reason: 'passkey-requires-credential' }
    }
  }
  sdb.update(user).set({ loginMethod: method }).where(eq(user.id, userId)).run()
  return { ok: true }
}
