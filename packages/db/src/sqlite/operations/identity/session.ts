import type { Database } from '@kobato/db/sqlite/database'
import type { SessionRow } from '@kobato/db/sqlite/types'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { session as sessionTable } from '@kobato/db/sqlite/schema/session'
import { and, count, eq, gt, isNotNull, lt, ne } from 'drizzle-orm'

export async function readLiveSessionData(db: Database, id: string): Promise<unknown> {
  const rows = await sqliteOf(db)
    .select({ data: sessionTable.data })
    .from(sessionTable)
    .where(and(eq(sessionTable.id, id), gt(sessionTable.expiresAt, new Date())))
    .limit(1)
  return rows[0]?.data ?? null
}

export async function upsertSession(
  db: Database,
  values: { id: string; userId: number | null; data: unknown; expiresAt: Date },
): Promise<void> {
  await sqliteOf(db)
    .insert(sessionTable)
    .values({ ...values })
    .onConflictDoUpdate({
      target: sessionTable.id,
      set: { userId: values.userId, data: values.data, expiresAt: values.expiresAt },
    })
}

export async function deleteSessionById(db: Database, id: string): Promise<void> {
  await sqliteOf(db).delete(sessionTable).where(eq(sessionTable.id, id))
}

export async function recordSessionLogin(
  db: Database,
  input: {
    sid: string
    userAgent: string
    platformHint: string | null
    ip: string
    loginAt: Date
    lastActiveAt: Date
  },
): Promise<void> {
  await sqliteOf(db)
    .update(sessionTable)
    .set({
      userAgent: input.userAgent,
      platformHint: input.platformHint,
      ip: input.ip,
      loginAt: input.loginAt,
      lastActiveAt: input.lastActiveAt,
    })
    .where(eq(sessionTable.id, input.sid))
}

export function recordSessionActivity(db: Database, sid: string, lastActiveAt: Date, expiresAt: Date): void {
  sqliteOf(db).update(sessionTable).set({ lastActiveAt, expiresAt }).where(eq(sessionTable.id, sid)).run()
}

export async function revokeSessionById(db: Database, sid: string, userId: number): Promise<void> {
  await sqliteOf(db)
    .delete(sessionTable)
    .where(and(eq(sessionTable.id, sid), eq(sessionTable.userId, userId)))
}

export async function findLiveSessionRow(db: Database, sid: string): Promise<SessionRow | null> {
  const rows = await sqliteOf(db)
    .select()
    .from(sessionTable)
    .where(and(eq(sessionTable.id, sid), gt(sessionTable.expiresAt, new Date())))
    .limit(1)
  return rows[0] ?? null
}

export async function listLiveSessionRowsByUser(db: Database, userId: number): Promise<SessionRow[]> {
  return sqliteOf(db)
    .select()
    .from(sessionTable)
    .where(and(eq(sessionTable.userId, userId), gt(sessionTable.expiresAt, new Date())))
}

export async function listLiveSessionRows(db: Database, maxRows: number): Promise<SessionRow[]> {
  return sqliteOf(db)
    .select()
    .from(sessionTable)
    .where(and(isNotNull(sessionTable.userId), gt(sessionTable.expiresAt, new Date())))
    .limit(maxRows)
}

export async function deleteSessionsOfUser(db: Database, userId: number, exceptSessionId?: string): Promise<number> {
  const result = await sqliteOf(db)
    .delete(sessionTable)
    .where(and(eq(sessionTable.userId, userId), exceptSessionId ? ne(sessionTable.id, exceptSessionId) : undefined))
  return Number(result.changes)
}

export async function countLiveSessions(db: Database): Promise<number> {
  const rows = await sqliteOf(db)
    .select({ value: count() })
    .from(sessionTable)
    .where(gt(sessionTable.expiresAt, new Date()))
  return rows[0]?.value ?? 0
}

export async function purgeExpiredSessions(db: Database, now: Date): Promise<void> {
  await sqliteOf(db).delete(sessionTable).where(lt(sessionTable.expiresAt, now))
}
