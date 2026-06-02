import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { recordAuditEventFromContext } from '@/server/domains/audit/service'
import { findSessionMeta, revokeSessionById } from '@/server/domains/auth/repo'
import { revokeAllSessionsOfUser } from '@/server/domains/auth/session-storage'
import { bulkApproveCommentsForUser, bulkDeleteCommentsForUser } from '@/server/domains/users/service'
import { adminProc } from '@/server/http/orpc-base'
import { findSafeUserById } from '@/server/infra/db/operations/user'
import { idFromString } from '@/shared/utils/id'

const userIdInput = z.object({ userId: z.string().min(1) })
const successOutput = z.object({ success: z.boolean() })

const revokeSession = adminProc
  .route({ method: 'POST', path: '/admin/users/revoke-session' })
  .input(z.object({ sessionId: z.string().min(1) }))
  .output(z.object({ success: z.boolean(), currentSession: z.boolean() }))
  .handler(async ({ input, context }) => {
    const currentSession = input.sessionId === context.session.id
    const meta = await findSessionMeta(input.sessionId)
    if (!meta) {
      return { success: true, currentSession }
    }
    // Ownership check: an admin may not revoke another admin's session
    // unless it is their own session. This prevents privilege escalation
    // where a compromised admin account kicks out all other admins.
    const targetUser = await findSafeUserById(context.db, meta.userId)
    if (targetUser?.role === 'admin' && meta.userId.toString() !== context.viewer.userId) {
      throw new ORPCError('FORBIDDEN', { message: '无权撤销其他管理员的会话。' })
    }
    await revokeSessionById(input.sessionId, meta.userId)
    recordAuditEventFromContext(context, {
      action: 'session_revoked',
      resourceType: 'session',
      resourceId: input.sessionId,
      details: { targetUserId: String(meta.userId), selfRevoke: currentSession },
    })
    return { success: true, currentSession }
  })

const revokeAllSessions = adminProc
  .route({ method: 'POST', path: '/admin/users/revoke-all-sessions' })
  .input(userIdInput)
  .output(successOutput)
  .handler(async ({ input, context }) => {
    let targetId: bigint
    try {
      targetId = idFromString(input.userId)
    } catch {
      throw new ORPCError('BAD_REQUEST', { message: '用户 ID 无效。' })
    }
    const target = await findSafeUserById(context.db, targetId)
    if (!target) {
      throw new ORPCError('NOT_FOUND', { message: '用户不存在' })
    }
    await revokeAllSessionsOfUser(targetId)
    recordAuditEventFromContext(context, {
      action: 'session_revoked',
      resourceType: 'session',
      resourceId: input.userId,
    })
    return { success: true }
  })

const bulkApproveComments = adminProc
  .route({ method: 'POST', path: '/admin/users/bulk-approve-comments' })
  .input(userIdInput)
  .output(z.object({ approved: z.number() }))
  .handler(async ({ input, context }) => {
    const result = await bulkApproveCommentsForUser(context.db, idFromString(input.userId))
    recordAuditEventFromContext(context, {
      action: 'comments_bulk_approved',
      resourceType: 'comment',
      resourceId: input.userId,
      details: { count: result.approved },
    })
    return result
  })

const bulkDeleteComments = adminProc
  .route({ method: 'POST', path: '/admin/users/bulk-delete-comments' })
  .input(userIdInput)
  .output(z.object({ deleted: z.number() }))
  .handler(async ({ input, context }) => {
    const result = await bulkDeleteCommentsForUser(context.db, idFromString(input.userId))
    recordAuditEventFromContext(context, {
      action: 'comments_bulk_deleted',
      resourceType: 'comment',
      resourceId: input.userId,
      details: { count: result.deleted },
    })
    return result
  })

export const adminUsersSessionsRouter = {
  revokeSession,
  revokeAllSessions,
  bulkApproveComments,
  bulkDeleteComments,
}
