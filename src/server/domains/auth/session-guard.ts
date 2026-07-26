// Session-revocation policy — the single owner of "who may revoke
// whose session". The session-table primitives (`repo.ts::revokeSessionById`,
// `service.ts::revokeAllSessionsOfUser`) are deliberately
// role-blind; every HTTP perimeter routes through one of the three
// scopes below instead of hand-rolling ownership checks:
//
//   own   — `account.revokeSession`: strict ownership, NO admin bypass.
//           The endpoint is an "own-route" (a user manages their own
//           sessions), the same semantics as the `is{Entity}Owner`
//           predicate family in `rbac.ts`.
//   admin — `admin.users.revokeSession`: an admin may revoke any
//           non-admin's session and their own, but never another LIVE
//           admin's — a compromised admin account must not be able to
//           kick out the other admins. Soft-deleted admins are exempt:
//           revoking their leftover sessions is janitorial.
//   bulk  — `admin.users.revokeAllSessions`: the same admin-vs-admin
//           rule keyed by user id instead of session id. Kept verbatim
//           from the original inline copy: the target lookup has NO
//           soft-delete exemption and the refusal message differs. Do
//           not "tidy" the two admin scopes into one rule without a
//           behaviour review.
//
// Audit events stay in the controllers — the guard only reports the
// affected user (or null for a no-op) so the caller can fill in the
// details.

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
  // Ownership check: an admin may not revoke another admin's session
  // unless it is their own session. This prevents privilege escalation
  // where a compromised admin account kicks out all other admins.
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
