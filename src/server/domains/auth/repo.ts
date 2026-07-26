// Session metadata data-access layer. The cookie-backed session storage
// lives in `session-storage.ts` (signed `__session` cookie + one row per
// session in the `session` table); this module owns the meta columns on
// that same row (`user_agent` / `platform_hint` / `ip` / `login_at` /
// `last_active_at`) that power `/my/sessions` and
// `/admin/security/sessions`.
//
// Orchestration (listing, revocation entry points) lives in
// `services/sessions.ts`. This module is limited to raw session-table
// reads/writes and their helpers.

import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, eq, gt, isNotNull, ne } from 'drizzle-orm'

import type { SessionRow } from '@/server/infra/db/types'
import type { Role } from '@/shared/utils/roles'

import { resolveSessionMaxAge } from '@/server/domains/auth/session-storage'
import { session as sessionTable } from '@/server/infra/db/schema/session'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('auth.sessions')

const USER_AGENT_MAX_LENGTH = 512

export interface SessionMeta {
  sid: string
  userId: bigint
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
  userId: bigint
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
 * Stamp the login metadata onto a freshly-established session's row.
 * Called from `establishLoginSession` AFTER the session row has been
 * committed (so the row exists with its `user_id` already set); the
 * UPDATE is a no-op when the row is gone.
 */
export async function recordSessionLogin(db: NodePgDatabase, input: RecordLoginInput): Promise<void> {
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
 * Fire-and-forget bump of `last_active_at` and `expires_at`. Called
 * from `resolveSessionContext` on every authenticated request — must
 * stay off the synchronous request path.
 *
 * The `expires_at` bump keeps the row aligned with the session cookie's
 * sliding-refresh: as long as the user is active, the session row gets
 * pushed forward by `SESSION_MAX_AGE`.
 */
export function recordSessionActivity(db: NodePgDatabase, sid: string): void {
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

// Rows whose owner or login meta is missing (an OTP-pending row, or a
// row committed but not yet stamped by `recordSessionLogin`) map to null.
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
 * Revoke one session by its id. The single DELETE carries the owner
 * match in its WHERE clause, so a session can only be dropped by a
 * caller that already resolved its owner.
 *
 * Role-blind: callers must go through `session-guard.ts` (own / admin /
 * bulk scopes) for the perimeter check.
 */
export async function revokeSessionById(db: NodePgDatabase, sid: string, userId: bigint): Promise<void> {
  await db.delete(sessionTable).where(and(eq(sessionTable.id, sid), eq(sessionTable.userId, userId)))
}

/**
 * Fetch one session's meta by id. Returns `null` when the row is gone,
 * expired, or has no owner stamped yet (the session expired, was
 * revoked, or never completed login). Used by the API actions to
 * confirm ownership before deleting.
 */
export async function findSessionMeta(db: NodePgDatabase, sid: string): Promise<SessionMeta | null> {
  const rows = await db
    .select()
    .from(sessionTable)
    .where(and(eq(sessionTable.id, sid), gt(sessionTable.expiresAt, new Date())))
    .limit(1)
  return sessionRowToMeta(rows[0])
}

/** Live (unexpired, owner-stamped) sessions belonging to one user. */
export async function listLiveSessionsByUser(db: NodePgDatabase, userId: bigint): Promise<SessionMeta[]> {
  const rows = await db
    .select()
    .from(sessionTable)
    .where(and(eq(sessionTable.userId, userId), gt(sessionTable.expiresAt, new Date())))
  return rows.map(sessionRowToMeta).filter((meta): meta is SessionMeta => meta !== null)
}

/** Live sessions across the site, soft-capped at `maxRows`. */
export async function listLiveSessions(db: NodePgDatabase, maxRows: number): Promise<SessionMeta[]> {
  const rows = await db
    .select()
    .from(sessionTable)
    .where(and(isNotNull(sessionTable.userId), gt(sessionTable.expiresAt, new Date())))
    .limit(maxRows)
  return rows.map(sessionRowToMeta).filter((meta): meta is SessionMeta => meta !== null)
}

/**
 * Drop every session belonging to one user in a single statement, with
 * an optional exemption for the caller's own session. Returns the number
 * of deleted rows.
 */
export async function deleteSessionsOfUser(
  db: NodePgDatabase,
  userId: bigint,
  exceptSessionId?: string,
): Promise<number> {
  const result = await db
    .delete(sessionTable)
    .where(and(eq(sessionTable.userId, userId), exceptSessionId ? ne(sessionTable.id, exceptSessionId) : undefined))
  return result.rowCount ?? 0
}
