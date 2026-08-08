// Session metadata data-access layer: raw reads/writes on the `session`
// row's meta columns (`user_agent` / `platform_hint` / `ip` / `login_at`
// / `last_active_at`); orchestration lives in `services/sessions.ts`.

import { and, eq, gt, isNotNull, ne } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { SessionRow } from '@/server/infra/db/types'
import type { Role } from '@/shared/utils/roles'

import { resolveSessionMaxAge } from '@/server/domains/auth/session-storage'
import { session as sessionTable } from '@/server/infra/db/schema/session'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('auth.sessions')

const USER_AGENT_MAX_LENGTH = 512

export interface SessionMeta {
  sid: string
  userId: number
  userAgent: string
  platformHint: string | null
  ip: string
  loginAt: Date
  lastActiveAt: Date
  expiresAt: Date
}

export interface SessionWithUser extends SessionMeta {
  userName: string
  userEmail: string
  userRole: Role | null
}

interface RecordLoginInput {
  sid: string
  userId: number
  userAgent: string | null
  platformHint?: string | null
  ip: string
  /** Defaults to now. Overridable for tests. */
  loginAt?: Date
}

function truncateUserAgent(ua: string | null): string {
  if (!ua) {
    return ''
  }
  return ua.length > USER_AGENT_MAX_LENGTH ? ua.slice(0, USER_AGENT_MAX_LENGTH) : ua
}

/**
 * Stamp login metadata on a session row. Must run AFTER the row is
 * committed; the UPDATE is a no-op when the row is gone.
 */
export async function recordSessionLogin(db: Database, input: RecordLoginInput): Promise<void> {
  const now = input.loginAt ?? new Date()
  await db
    .update(sessionTable)
    .set({
      userAgent: truncateUserAgent(input.userAgent),
      platformHint: input.platformHint ?? null,
      ip: input.ip,
      loginAt: now,
      lastActiveAt: now,
    })
    .where(eq(sessionTable.id, input.sid))
}

/**
 * Fire-and-forget bump of `last_active_at`/`expires_at`; must stay off
 * the synchronous request path.
 */
export function recordSessionActivity(db: Database, sid: string): void {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + resolveSessionMaxAge() * 1000)
  void db
    .update(sessionTable)
    .set({ lastActiveAt: now, expiresAt })
    .where(eq(sessionTable.id, sid))
    .then(
      () => undefined,
      (error) => {
        log.warn('failed to refresh session meta', { sid, error: String(error) })
      },
    )
}

// Rows with missing owner or login meta (e.g. OTP-pending) map to null.
function sessionRowToMeta(row: SessionRow | undefined): SessionMeta | null {
  if (!row || row.userId === null || row.loginAt === null || row.lastActiveAt === null) {
    return null
  }
  return {
    sid: row.id,
    userId: row.userId,
    userAgent: row.userAgent ?? '',
    platformHint: row.platformHint,
    ip: row.ip ?? '',
    loginAt: row.loginAt,
    lastActiveAt: row.lastActiveAt,
    expiresAt: row.expiresAt,
  }
}

/**
 * Revoke one session; the DELETE carries the owner match in its WHERE.
 * Role-blind — the perimeter check lives in `session-guard.ts`.
 */
export async function revokeSessionById(db: Database, sid: string, userId: number): Promise<void> {
  await db.delete(sessionTable).where(and(eq(sessionTable.id, sid), eq(sessionTable.userId, userId)))
}

/**
 * Fetch one session's meta by id; null when gone, expired, or unstamped.
 */
export async function findSessionMeta(db: Database, sid: string): Promise<SessionMeta | null> {
  const rows = await db
    .select()
    .from(sessionTable)
    .where(and(eq(sessionTable.id, sid), gt(sessionTable.expiresAt, new Date())))
    .limit(1)
  return sessionRowToMeta(rows[0])
}

/** Live (unexpired, owner-stamped) sessions belonging to one user. */
export async function listLiveSessionsByUser(db: Database, userId: number): Promise<SessionMeta[]> {
  const rows = await db
    .select()
    .from(sessionTable)
    .where(and(eq(sessionTable.userId, userId), gt(sessionTable.expiresAt, new Date())))
  return rows.map(sessionRowToMeta).filter((meta): meta is SessionMeta => meta !== null)
}

/** Live sessions across the site, soft-capped at `maxRows`. */
export async function listLiveSessions(db: Database, maxRows: number): Promise<SessionMeta[]> {
  const rows = await db
    .select()
    .from(sessionTable)
    .where(and(isNotNull(sessionTable.userId), gt(sessionTable.expiresAt, new Date())))
    .limit(maxRows)
  return rows.map(sessionRowToMeta).filter((meta): meta is SessionMeta => meta !== null)
}

/** Delete every session of a user, optionally exempting one sid. */
export async function deleteSessionsOfUser(db: Database, userId: number, exceptSessionId?: string): Promise<number> {
  const result = await db
    .delete(sessionTable)
    .where(and(eq(sessionTable.userId, userId), exceptSessionId ? ne(sessionTable.id, exceptSessionId) : undefined))
  return Number(result.changes)
}
