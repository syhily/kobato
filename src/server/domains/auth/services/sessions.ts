// Session orchestration: listing/revocation entry points composing the
// raw data-access primitives from `repo.ts`. Revocation policy
// ("who may revoke whose session") lives in `session-guard.ts`.

import type { SessionMeta, SessionWithUser } from '@/server/domains/auth/repo'
import type { Database } from '@/server/infra/db/database'

import { deleteSessionsOfUser, listLiveSessions, listLiveSessionsByUser } from '@/server/domains/auth/repo'
import { findUsersByIds } from '@/server/infra/db/operations/user'

const MAX_SESSIONS_LISTED = 10_000

/**
 * Revoke every session of a user — after password change or role
 * downgrade, so stale cookies cannot be reused. `exceptSessionId` keeps
 * one session alive (the tab that just saved the new password).
 */
export async function revokeAllSessionsOfUser(db: Database, userId: number, exceptSessionId?: string): Promise<number> {
  return deleteSessionsOfUser(db, userId, exceptSessionId)
}

/**
 * Every active session for one user; unstamped login rows are filtered
 * out — they would render as empty rows in the UI.
 */
export async function listSessionsByUser(db: Database, userId: number): Promise<SessionMeta[]> {
  return listLiveSessionsByUser(db, userId)
}

/**
 * Every active session site-wide, joined against `user`. Soft-capped at
 * `MAX_SESSIONS_LISTED` rows.
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
    return Object.assign({}, meta, {
      userName: u?.name ?? '已删除的用户',
      userEmail: u?.email ?? '',
      userRole: u?.role ?? null,
    })
  })
}
