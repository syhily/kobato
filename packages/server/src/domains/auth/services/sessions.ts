import type { Database } from '@kobato/db/database.ts'
import type { SessionMeta, SessionWithUser } from '@kobato/server/domains/auth/repo.ts'

import { findUsersByIds } from '@kobato/db/operations/user.ts'
import { deleteSessionsOfUser, listLiveSessions, listLiveSessionsByUser } from '@kobato/server/domains/auth/repo.ts'

const MAX_SESSIONS_LISTED = 10_000

export async function revokeAllSessionsOfUser(db: Database, userId: number, exceptSessionId?: string): Promise<number> {
  return deleteSessionsOfUser(db, userId, exceptSessionId)
}

export async function listSessionsByUser(db: Database, userId: number): Promise<SessionMeta[]> {
  return listLiveSessionsByUser(db, userId)
}

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
      userName: u?.name ?? '',
      userEmail: u?.email ?? '',
      userRole: u?.role ?? null,
    })
  })
}
