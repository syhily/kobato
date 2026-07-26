// Session-revocation policy — the single owner of "who may revoke whose
// session". Three scopes:
//   own   — strict ownership, no admin bypass.
//   admin — an admin may revoke any non-admin's session and their own,
//           but never another live admin's.
//   bulk  — same admin-vs-admin rule, but no soft-delete exemption.

import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { ViewerIdentity } from '@/server/domains/auth/rbac'

import { findSessionMeta, revokeSessionById } from '@/server/domains/auth/repo'
import { revokeAllSessionsOfUser } from '@/server/domains/auth/services/sessions'
import { findSafeUserById } from '@/server/infra/db/operations/user'
import { DomainError } from '@/server/infra/http/errors'

/** Outcome of a single-session revocation: the session owner, or null when the meta was already gone (no-op). */
export interface SessionRevocation {
  targetUserId: bigint | null
}

/**
 * Own-scope: revoke one of the actor's own sessions. Strict ownership —
 * an admin acting through `account.revokeSession` gets no bypass, so
 * the audit trail always reads as the owner managing their own session.
 */
export async function revokeOwnSessionWithGuard(
  db: NodePgDatabase,
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
 * Admin-scope: revoke one session by id. An admin may revoke any
 * non-admin's session, but never another live admin's. Reaching this
 * with a non-admin actor is not possible through `adminProc`; the role
 * check stays as defence in depth.
 */
export async function revokeSessionWithGuard(
  db: NodePgDatabase,
  sessionId: string,
  actor: ViewerIdentity,
): Promise<SessionRevocation> {
  const meta = await findSessionMeta(db, sessionId)
  if (!meta) {
    return { targetUserId: null }
  }
  // An admin may not revoke another live admin's session unless it is
  // their own — prevents a compromised admin kicking out the others.
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
 * Bulk-scope: revoke every session belonging to one user. An admin may
 * not bulk-revoke another admin's sessions; unlike the single-session
 * scope there is no soft-delete exemption (kept from the original
 * inline copy — see the module header).
 */
export async function revokeAllSessionsWithGuard(
  db: NodePgDatabase,
  targetUserId: bigint,
  actor: ViewerIdentity,
): Promise<void> {
  const targetUser = await findSafeUserById(db, targetUserId)
  if (targetUser?.role === 'admin' && targetUserId.toString() !== actor.id) {
    throw new DomainError('FORBIDDEN', '无权撤销其他管理员的全部会话。')
  }
  await revokeAllSessionsOfUser(db, targetUserId)
}
