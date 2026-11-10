// Session orchestration over the primitives in `repo.ts`; revocation policy
// ("who may revoke whose session") lives in `session-guard.ts`.

import type { SessionMeta, SessionWithUser } from '@/server/domains/auth/repo'
import type { Database } from '@/server/infra/db/database'

import { deleteSessionsOfUser, listLiveSessions, listLiveSessionsByUser } from '@/server/domains/auth/repo'
import { findUsersByIds } from '@/server/infra/db/operations/user'

const MAX_SESSIONS_LISTED = 10_000

/**
 * Revoke every session of a user after a password change or role downgrade so stale
 * cookies cannot be reused; `exceptSessionId` keeps the tab that just saved alive.
 */
export async function revokeAllSessionsOfUser(db: Database, userId: number, exceptSessionId?: string): Promise<number> {
  return deleteSessionsOfUser(db, userId, exceptSessionId)
}

/**
 * Every active session for one user; unstamped login rows are dropped because they
 * would render as empty rows in the UI.
 */
export async function listSessionsByUser(db: Database, userId: number): Promise<SessionMeta[]> {
  return listLiveSessionsByUser(db, userId)
}

/**
 * Every active session site-wide, joined against `user`; soft-capped at `MAX_SESSIONS_LISTED`.
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
      // Empty when the user row is gone — the caller localizes the placeholder.
      userName: u?.name ?? '',
      userEmail: u?.email ?? '',
      userRole: u?.role ?? null,
    })
  })
}
