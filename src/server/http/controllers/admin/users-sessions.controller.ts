import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { formatUaLabel } from '@/server/domains/analytics/ua-parse'
import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { listAllSessions } from '@/server/domains/auth/services/sessions'
import { revokeAllSessionsWithGuard, revokeSessionWithGuard } from '@/server/domains/auth/session-guard'
import { bulkApproveCommentsByUser, bulkDeleteCommentsByUser } from '@/server/domains/comments/services/moderate'
import { adminProc } from '@/server/http/orpc-base'
import { adminUsersListSessionsOutputSchema } from '@/shared/contracts/admin'
import { idFromString } from '@/shared/utils/id'

const userIdInput = z.object({ userId: z.string().min(1) })
const successOutput = z.object({ success: z.boolean() })

// Every live session, joined against the user — the security page sorts and
// projects `isCurrent` in the loader. The UA label is rendered here (the
// detector dataset is server-only; route loaders cannot import the domain).
const listSessions = adminProc
  .route({ method: 'GET', path: '/admin/users/list-sessions' })
  .output(adminUsersListSessionsOutputSchema)
  .handler(async ({ context }) => {
    const rows = await listAllSessions(context.db)
    return rows.map((row) => ({
      sid: row.sid,
      userId: row.userId,
      label: formatUaLabel(row.userAgent, row.platformHint),
      ip: row.ip,
      loginAt: row.loginAt,
      lastActiveAt: row.lastActiveAt,
      expiresAt: row.expiresAt,
      userName: row.userName,
      userEmail: row.userEmail,
      userRole: row.userRole,
    }))
  })

const revokeSession = adminProc
  .route({ method: 'POST', path: '/admin/users/revoke-session' })
  .input(z.object({ sessionId: z.string().min(1) }))
  .output(z.object({ success: z.boolean(), currentSession: z.boolean() }))
  .handler(async ({ input, context }) => {
    const currentSession = input.sessionId === context.session.id
    const result = await revokeSessionWithGuard(context.db, input.sessionId, context.viewer)
    recordAuditEventFromContext(context, {
      action: 'session_revoked',
      resourceType: 'session',
      resourceId: input.sessionId,
      details: { targetUserId: result.targetUserId ? String(result.targetUserId) : null, selfRevoke: currentSession },
    })
    return { success: true, currentSession }
  })

const revokeAllSessions = adminProc
  .route({ method: 'POST', path: '/admin/users/revoke-all-sessions' })
  .input(userIdInput)
  .output(successOutput)
  .handler(async ({ input, context }) => {
    let targetId: number
    try {
      targetId = idFromString(input.userId)
    } catch {
      throw new ORPCError('BAD_REQUEST', { message: '用户 ID 无效。' })
    }
    await revokeAllSessionsWithGuard(context.db, targetId, context.viewer)
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
    const result = await bulkApproveCommentsByUser(context.db, idFromString(input.userId))
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
    const result = await bulkDeleteCommentsByUser(context.db, idFromString(input.userId))
    recordAuditEventFromContext(context, {
      action: 'comments_bulk_deleted',
      resourceType: 'comment',
      resourceId: input.userId,
      details: { count: result.deleted },
    })
    return result
  })

export const adminUsersSessionsRouter = {
  listSessions,
  revokeSession,
  revokeAllSessions,
  bulkApproveComments,
  bulkDeleteComments,
}
