import { adminUsersSessionsContract } from '@kobato/api/admin/users'
import { formatUaLabel } from '@kobato/server/domains/analytics/ua-parse'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record'
import { listAllSessions } from '@kobato/server/domains/auth/services/sessions'
import { revokeAllSessionsWithGuard, revokeSessionWithGuard } from '@kobato/server/domains/auth/session-guard'
import { bulkApproveCommentsByUser, bulkDeleteCommentsByUser } from '@kobato/server/domains/comments/services/moderate'
import { implementAdmin, localizedOrpcError } from '@kobato/server/http/orpc-base'
import { createServerTranslator } from '@kobato/server/infra/i18n'
import { idFromString } from '@kobato/utils/id'

const impl = implementAdmin(adminUsersSessionsContract)

const listSessions = impl.listSessions.handler(async ({ context }) => {
  const rows = await listAllSessions(context.db)
  const translator = createServerTranslator(context.localization.locale)
  return rows.map((row) => ({
    sid: row.sid,
    userId: row.userId,
    label: formatUaLabel(row.userAgent, row.platformHint, translator.format('auth.sessions.unknownDevice')),
    ip: row.ip,
    loginAt: row.loginAt,
    lastActiveAt: row.lastActiveAt,
    expiresAt: row.expiresAt,
    userName: row.userName === '' ? translator.format('auth.sessions.deletedUser') : row.userName,
    userEmail: row.userEmail,
    userRole: row.userRole,
  }))
})

const revokeSession = impl.revokeSession.handler(async ({ input, context }) => {
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

const revokeAllSessions = impl.revokeAllSessions.handler(async ({ input, context }) => {
  let targetId: number
  try {
    targetId = idFromString(input.userId)
  } catch {
    throw localizedOrpcError(context, 'BAD_REQUEST', 'account.error.invalidUserId')
  }
  await revokeAllSessionsWithGuard(context.db, targetId, context.viewer)
  recordAuditEventFromContext(context, {
    action: 'session_revoked',
    resourceType: 'session',
    resourceId: input.userId,
  })
  return { success: true }
})

const bulkApproveComments = impl.bulkApproveComments.handler(async ({ input, context }) => {
  const result = await bulkApproveCommentsByUser(context.db, idFromString(input.userId))
  recordAuditEventFromContext(context, {
    action: 'comments_bulk_approved',
    resourceType: 'comment',
    resourceId: input.userId,
    details: { count: result.approved },
  })
  return result
})

const bulkDeleteComments = impl.bulkDeleteComments.handler(async ({ input, context }) => {
  const result = await bulkDeleteCommentsByUser(context.db, idFromString(input.userId))
  recordAuditEventFromContext(context, {
    action: 'comments_bulk_deleted',
    resourceType: 'comment',
    resourceId: input.userId,
    details: { count: result.deleted },
  })
  return result
})

export const adminUsersSessionsRouter = impl.router({
  listSessions,
  revokeSession,
  revokeAllSessions,
  bulkApproveComments,
  bulkDeleteComments,
})
