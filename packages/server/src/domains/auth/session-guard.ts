import type { Database } from '@kobato/db/sqlite/database'
import type { ViewerIdentity } from '@kobato/server/domains/auth/rbac'

import { findSafeUserById } from '@kobato/db/sqlite/operations/identity/user'
import { findSessionMeta, revokeSessionById } from '@kobato/server/domains/auth/repo'
import { revokeAllSessionsOfUser } from '@kobato/server/domains/auth/services/sessions'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'

export interface SessionRevocation {
  targetUserId: number | null
}

export async function revokeOwnSessionWithGuard(
  db: Database,
  sessionId: string,
  actor: ViewerIdentity,
): Promise<SessionRevocation> {
  const meta = await findSessionMeta(db, sessionId)
  if (!meta) {
    return { targetUserId: null }
  }
  if (meta.userId.toString() !== actor.id) {
    throw new DomainError('FORBIDDEN', descriptorFor('auth.sessions.error.forbidden'))
  }
  await revokeSessionById(db, sessionId, meta.userId)
  return { targetUserId: meta.userId }
}

export async function revokeSessionWithGuard(
  db: Database,
  sessionId: string,
  actor: ViewerIdentity,
): Promise<SessionRevocation> {
  const meta = await findSessionMeta(db, sessionId)
  if (!meta) {
    return { targetUserId: null }
  }
  if (actor.role === 'admin' && meta.userId.toString() !== actor.id) {
    const targetUser = await findSafeUserById(db, meta.userId)
    if (targetUser && !targetUser.deletedAt && targetUser.role === 'admin') {
      throw new DomainError('FORBIDDEN', descriptorFor('auth.sessions.error.forbiddenRevoke'))
    }
  }
  await revokeSessionById(db, sessionId, meta.userId)
  return { targetUserId: meta.userId }
}

export async function revokeAllSessionsWithGuard(
  db: Database,
  targetUserId: number,
  actor: ViewerIdentity,
): Promise<void> {
  const targetUser = await findSafeUserById(db, targetUserId)
  if (targetUser?.role === 'admin' && targetUserId.toString() !== actor.id) {
    throw new DomainError('FORBIDDEN', descriptorFor('auth.sessions.error.forbiddenRevokeAll'))
  }
  await revokeAllSessionsOfUser(db, targetUserId)
}
