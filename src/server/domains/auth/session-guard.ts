// Session-revocation policy: the single owner of "who may revoke whose session".

import type { ViewerIdentity } from '@/server/domains/auth/rbac'
import type { Database } from '@/server/infra/db/database'

import { findSessionMeta, revokeSessionById } from '@/server/domains/auth/repo'
import { revokeAllSessionsOfUser } from '@/server/domains/auth/services/sessions'
import { findSafeUserById } from '@/server/infra/db/operations/user'
import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { DomainError } from '@/server/infra/http/errors'

/** Session owner, or null when the meta was already gone (no-op). */
export interface SessionRevocation {
  targetUserId: number | null
}

/**
 * Own-scope revocation: strict ownership, no admin bypass, so the audit trail
 * always reads as the owner managing their own session.
 */
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

/**
 * Admin-scope revocation: any non-admin's session, or the actor's own, never another
 * live admin's. The role check is defence in depth.
 */
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

/**
 * Bulk-scope revocation: never another admin's sessions, and no soft-delete
 * exemption (unlike the single-session scope).
 */
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
