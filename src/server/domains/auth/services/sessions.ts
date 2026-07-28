// Session orchestration: listing and revocation entry points that
// compose the raw data-access primitives from `repo.ts`. Keeps `repo.ts`
// lean (direct session-table reads/writes) per the domain locked
// vocabulary. Revocation policy ("who may revoke whose session") lives
// in `session-guard.ts`.

import type { SessionMeta, SessionWithUser } from '@/server/domains/auth/repo'
import type { Database } from '@/server/infra/db/database'

import { deleteSessionsOfUser, listLiveSessions, listLiveSessionsByUser } from '@/server/domains/auth/repo'
import { findUsersByIds } from '@/server/infra/db/operations/user'

const MAX_SESSIONS_LISTED = 10_000

/**
 * Revoke every session belonging to a user — a single
 * `DELETE FROM session WHERE user_id = $1` statement. Called after
 * password change or role downgrade so stale cookies cannot be reused.
 *
 * `exceptSessionId` keeps one session alive — used by self-service
 * password change so the user is not logged out from the tab that just
 * saved the new password.
 *
 * Returns the number of revoked sessions.
 */
export async function revokeAllSessionsOfUser(db: Database, userId: number, exceptSessionId?: string): Promise<number> {
  return deleteSessionsOfUser(db, userId, exceptSessionId)
}

/**
 * Enumerate every active session for one user. Rows whose login meta
 * has not been stamped yet (a row committed but not yet updated by
 * `recordSessionLogin`) are filtered out — they would render as empty
 * rows in the UI.
 */
export async function listSessionsByUser(db: Database, userId: number): Promise<SessionMeta[]> {
  return listLiveSessionsByUser(db, userId)
}

/**
 * Enumerate every active session across the site and join the results
 * against the `user` table in a single bulk read.
 *
 * Soft-capped at `MAX_SESSIONS_LISTED` rows to bound memory usage on
 * long-running deployments.
 */
export async function listAllSessions(db: Database): Promise<SessionWithUser[]> {
  const metas = await listLiveSessions(db, MAX_SESSIONS_LISTED)
  if (metas.length === 0) {
    return []
  }
  const uniqueIds = Array.from(new Set(metas.map((m) => m.userId)))
  const users = await findUsersByIds(db, uniqueIds)
  const userById = new Map(users.map((u) => [u.id.toString(), u]))
  return metas.map((meta) => {
    const u = userById.get(meta.userId.toString())
    return {
      ...meta,
      userName: u?.name ?? '已删除的用户',
      userEmail: u?.email ?? '',
      userRole: u?.role ?? null,
    }
  })
}
