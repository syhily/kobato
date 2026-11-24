import type { Database } from '@kobato/db/sqlite/database'
import type { NewOneTimeToken } from '@kobato/db/sqlite/types'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { oneTimeToken } from '@kobato/db/sqlite/schema/one-time-token'
import { and, eq, gt, inArray, lt } from 'drizzle-orm'

export async function findLiveOneTimeToken(db: Database, key: string): Promise<unknown> {
  const rows = await sqliteOf(db)
    .select({ payload: oneTimeToken.payload })
    .from(oneTimeToken)
    .where(and(eq(oneTimeToken.key, key), gt(oneTimeToken.expiresAt, new Date())))
    .limit(1)
  return rows[0]?.payload ?? null
}

export async function upsertOneTimeToken(
  db: Database,
  values: { key: string; payload: unknown; expiresAt: Date },
): Promise<void> {
  await sqliteOf(db)
    .insert(oneTimeToken)
    .values(values)
    .onConflictDoUpdate({
      target: oneTimeToken.key,
      set: { payload: values.payload, expiresAt: values.expiresAt },
    })
}

export async function insertOneTimeToken(db: Database, values: NewOneTimeToken): Promise<void> {
  await sqliteOf(db).insert(oneTimeToken).values(values)
}

export async function deleteOneTimeToken(db: Database, key: string): Promise<void> {
  await sqliteOf(db).delete(oneTimeToken).where(eq(oneTimeToken.key, key))
}

export async function consumeLiveOneTimeToken(db: Database, key: string): Promise<unknown> {
  const rows = await sqliteOf(db)
    .delete(oneTimeToken)
    .where(and(eq(oneTimeToken.key, key), gt(oneTimeToken.expiresAt, new Date())))
    .returning({ payload: oneTimeToken.payload })
  return rows[0]?.payload ?? null
}

export async function findLiveOneTimeTokenPayloads(db: Database, keys: string[]): Promise<Map<string, unknown>> {
  if (keys.length === 0) {
    return new Map()
  }
  const rows = await sqliteOf(db)
    .select({ key: oneTimeToken.key, payload: oneTimeToken.payload })
    .from(oneTimeToken)
    .where(and(inArray(oneTimeToken.key, keys), gt(oneTimeToken.expiresAt, new Date())))
  return new Map(rows.map((row) => [row.key, row.payload]))
}

export async function purgeExpiredOneTimeTokens(db: Database, now: Date): Promise<void> {
  await sqliteOf(db).delete(oneTimeToken).where(lt(oneTimeToken.expiresAt, now))
}
