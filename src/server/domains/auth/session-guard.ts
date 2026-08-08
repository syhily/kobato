// Session-revocation policy — the single owner of "who may revoke whose
// session". own: strict ownership; admin: any non-admin + own, never
// another live admin; bulk: same rule, no soft-delete exemption.

import type { ViewerIdentity } from '@/server/domains/auth/rbac'
import type { Database } from '@/server/infra/db/database'

import { findSessionMeta, revokeSessionById } from '@/server/domains/auth/repo'
import { revokeAllSessionsOfUser } from '@/server/domains/auth/services/sessions'
import { findSafeUserById } from '@/server/infra/db/operations/user'
import { DomainError } from '@/server/infra/http/errors'

/** Outcome of a single-session revocation: the session owner, or null when the meta was already gone (no-op). */
export interface SessionRevocation {
  targetUserId: number | null
}

/**
 * Own-scope revocation: strict ownership — no admin bypass, so the
 * audit trail always reads as the owner managing their own session.
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
    throw new DomainError('FORBIDDEN', '无权操作该会话。')
  }
  await revokeSessionById(db, sessionId, meta.userId)
  return { targetUserId: meta.userId }
}

/**
 * Admin-scope revocation: any non-admin's session, or the actor's own —
 * never another live admin's. The role check is defence in depth.
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
  // An admin may not revoke another live admin's session (only their own).
  if (actor.role === 'admin' && meta.userId.toString() !== actor.id) {
    const targetUser = await findSafeUserById(db, meta.userId)
    if (targetUser && !targetUser.deletedAt && targetUser.role === 'admin') {
      throw new DomainError('FORBIDDEN', '无权撤销其他管理员的会话。')
    }
  }
  await revokeSessionById(db, sessionId, meta.userId)
  return { targetUserId: meta.userId }
}

/**
 * Bulk-scope revocation: never another admin's sessions; no soft-delete
 * exemption (unlike the single-session scope).
 */
export async function revokeAllSessionsWithGuard(
  db: Database,
  targetUserId: number,
  actor: ViewerIdentity,
): Promise<void> {
  const targetUser = await findSafeUserById(db, targetUserId)
  if (targetUser?.role === 'admin' && targetUserId.toString() !== actor.id) {
    throw new DomainError('FORBIDDEN', '无权撤销其他管理员的全部会话。')
  }
  await revokeAllSessionsOfUser(db, targetUserId)
}
