import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { recordAuditEventFromContext } from '@/server/domains/audit/service'
import { findSessionMeta, revokeSessionById } from '@/server/domains/auth/repo'
import { revokeAllSessionsOfUser } from '@/server/domains/auth/session-storage'
import { issueResetToken, issueSetupToken, revokeTokensFor } from '@/server/domains/auth/verification-tokens'
import {
  bulkApproveCommentsForUser,
  bulkDeleteCommentsForUser,
  fetchAdminUserDto,
  listUsersForAdmin,
  muteAdminUser,
  restoreAdminUser,
  softDeleteAdminUser,
  toAdminUserDto,
} from '@/server/domains/users/service'
import { adminProc } from '@/server/http/orpc-base'
import {
  countAdmins,
  findUserByEmail,
  findUserById,
  insertAuthor,
  softDeleteUserById,
  updateUserById,
  updateUserRole,
} from '@/server/infra/db/operations/user'
import { sendAuthorInvite, sendPasswordReset as sendPasswordResetEmail } from '@/server/infra/email/sender'
import {
  tryInviteByEmailRateLimit,
  tryInviteRateLimit,
  tryPasswordResetByTargetRateLimit,
} from '@/server/infra/rate-limit'
import { adminUserDto } from '@/shared/contracts/users'

const idInput = z.object({ id: z.string().min(1) })
const userIdInput = z.object({ userId: z.string().min(1) })
const successOutput = z.object({ success: z.boolean() })

const list = adminProc
  .route({ method: 'GET', path: '/admin/users/list' })
  .input(
    z.object({
      offset: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(100).default(20),
      q: z.string().trim().max(100).optional(),
      role: z.enum(['all', 'admin', 'author', 'visitor', 'normal']).default('all'),
      includeDeleted: z.boolean().default(false),
      hasPosts: z.boolean().default(false),
      sortBy: z.enum(['recent', 'commentCount']).default('recent'),
    }),
  )
  .output(z.object({ users: z.array(adminUserDto), total: z.number(), hasMore: z.boolean() }))
  .handler(async ({ input }) => {
    const result = await listUsersForAdmin(
      input.offset,
      input.limit,
      { q: input.q, role: input.role, includeDeleted: input.includeDeleted, hasPosts: input.hasPosts },
      input.sortBy,
    )
    return { users: result.users.map(toAdminUserDto), total: result.total, hasMore: result.hasMore }
  })

const get = adminProc
  .route({ method: 'GET', path: '/admin/users/get' })
  .input(idInput)
  .output(z.object({ user: adminUserDto }))
  .handler(async ({ input }) => {
    const user = await fetchAdminUserDto(BigInt(input.id))
    if (!user) {
      throw new ORPCError('NOT_FOUND', { message: '用户不存在' })
    }
    return { user }
  })

const update = adminProc
  .route({ method: 'POST', path: '/admin/users/update' })
  .input(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1).optional(),
      email: z.email().optional(),
      link: z.string().optional(),
      badgeName: z.string().optional(),
      badgeColor: z.string().optional(),
      badgeTextColor: z.union([z.string(), z.null()]).optional(),
    }),
  )
  .output(successOutput)
  .handler(async ({ input, context }) => {
    const { id, ...patch } = input
    const updated = await updateUserById(BigInt(id), patch)
    if (updated === null) {
      throw new ORPCError('NOT_FOUND', { message: '用户不存在' })
    }
    recordAuditEventFromContext(context, {
      action: 'user_updated',
      resourceType: 'user',
      resourceId: id,
      details: { fields: Object.keys(patch) },
    })
    return { success: true }
  })

const softDelete = adminProc
  .route({ method: 'POST', path: '/admin/users/soft-delete' })
  .input(idInput)
  .output(z.void())
  .handler(async ({ input, context }) => {
    const userId = input.id
    if (context.viewer.userId === userId) {
      throw new ORPCError('FORBIDDEN', { message: '不能删除自己。' })
    }
    const targetId = BigInt(userId)
    const target = await findUserById(targetId)
    if (!target) {
      throw new ORPCError('NOT_FOUND', { message: '用户不存在' })
    }
    if (target.role === 'admin') {
      const adminCount = await countAdmins()
      if (adminCount <= 1) {
        throw new ORPCError('CONFLICT', { message: '不能删除唯一的管理员。' })
      }
    }
    const ok = await softDeleteAdminUser(targetId)
    if (!ok) {
      throw new ORPCError('NOT_FOUND', { message: '用户不存在或已被删除' })
    }
    await revokeAllSessionsOfUser(targetId)
    recordAuditEventFromContext(context, {
      action: 'user_soft_deleted',
      resourceType: 'user',
      resourceId: userId,
      details: { previousRole: target.role },
    })
  })

const restore = adminProc
  .route({ method: 'POST', path: '/admin/users/restore' })
  .input(idInput)
  .output(successOutput)
  .handler(async ({ input, context }) => {
    const ok = await restoreAdminUser(BigInt(input.id))
    if (!ok) {
      throw new ORPCError('NOT_FOUND', { message: '用户不存在' })
    }
    recordAuditEventFromContext(context, {
      action: 'user_restored',
      resourceType: 'user',
      resourceId: input.id,
    })
    return { success: true }
  })

const mute = adminProc
  .route({ method: 'POST', path: '/admin/users/mute' })
  .input(z.object({ id: z.string().min(1), muted: z.boolean() }))
  .output(z.object({ user: adminUserDto }))
  .handler(async ({ input, context }) => {
    const updated = await muteAdminUser(BigInt(input.id), input.muted)
    if (!updated) {
      throw new ORPCError('NOT_FOUND', { message: '用户不存在或为管理员（管理员不可禁言）' })
    }
    const dto = await fetchAdminUserDto(updated.id)
    if (!dto) {
      throw new ORPCError('NOT_FOUND', { message: '用户不存在' })
    }
    recordAuditEventFromContext(context, {
      action: input.muted ? 'user_muted' : 'user_unmuted',
      resourceType: 'user',
      resourceId: input.id,
    })
    return { user: dto }
  })

const updateRole = adminProc
  .route({ method: 'POST', path: '/admin/users/update-role' })
  .input(z.object({ id: z.string().min(1), role: z.enum(['admin', 'author', 'visitor']).nullable() }))
  .output(z.object({ user: adminUserDto.nullable() }))
  .handler(async ({ input, context }) => {
    const userId = input.id
    if (context.viewer.userId === userId) {
      throw new ORPCError('FORBIDDEN', { message: '不能修改自己的角色。' })
    }
    const targetId = BigInt(userId)
    const target = await findUserById(targetId)
    if (!target) {
      throw new ORPCError('NOT_FOUND', { message: '用户不存在。' })
    }
    if (target.role === 'admin' && input.role !== 'admin') {
      const adminCount = await countAdmins()
      if (adminCount <= 1) {
        throw new ORPCError('CONFLICT', { message: '不能降级唯一的管理员。' })
      }
    }
    const updated = await updateUserRole(targetId, input.role)
    if (updated) {
      await revokeAllSessionsOfUser(targetId)
      recordAuditEventFromContext(context, {
        action: 'user_role_changed',
        resourceType: 'user',
        resourceId: userId,
        details: { from: target.role, to: input.role },
      })
    }
    const dto = await fetchAdminUserDto(targetId)
    return { user: dto }
  })

const inviteAuthor = adminProc
  .route({ method: 'POST', path: '/admin/users/invite-author' })
  .input(z.object({ email: z.email().min(1), name: z.string().min(1).max(100) }))
  .output(successOutput)
  .handler(async ({ input, context }) => {
    const existing = await findUserByEmail(input.email)
    if (existing !== null) {
      throw new ORPCError('CONFLICT', { message: '该邮箱已被注册。' })
    }
    const [ipLimit, emailLimit] = await Promise.all([
      tryInviteRateLimit(context.clientAddress),
      tryInviteByEmailRateLimit(BigInt(context.viewer.userId), input.email),
    ])
    if (ipLimit.exceeded || emailLimit.exceeded) {
      throw new ORPCError('TOO_MANY_REQUESTS', { message: '邀请发送过于频繁，请稍后再试。' })
    }
    const [user] = await insertAuthor(input.name, input.email)
    if (!user) {
      throw new ORPCError('INTERNAL_SERVER_ERROR', { message: '创建作者账户失败。' })
    }
    const { token } = await issueSetupToken(user.id)
    const origin = new URL(context.request.url).origin
    const link = `${origin}/admin/signin?action=accept-invite&token=${encodeURIComponent(token)}`
    const inviterSession = context.session.get('user')
    const inviter = inviterSession?.name ?? '管理员'
    const sendResult = await sendAuthorInvite(user, link, inviter, inviterSession?.email)
    if (!sendResult.ok) {
      await revokeTokensFor(user.id, 'author-invite')
      await softDeleteUserById(user.id)
      recordAuditEventFromContext(context, {
        action: 'author_invite_rolled_back',
        resourceType: 'user',
        resourceId: String(user.id),
        details: { email: input.email, reason: sendResult.reason, message: sendResult.message },
      })
      throw new ORPCError('BAD_GATEWAY', {
        message: `邮件发送失败，已回滚账户创建：${sendResult.message}`,
      })
    }
    recordAuditEventFromContext(context, {
      action: 'author_invited',
      resourceType: 'user',
      resourceId: String(user.id),
      details: { email: input.email },
    })
    return { success: true }
  })

const sendPasswordReset = adminProc
  .route({ method: 'POST', path: '/admin/users/send-password-reset' })
  .input(z.object({ email: z.email().min(1) }))
  .output(successOutput)
  .handler(async ({ input, context }) => {
    const user = await findUserByEmail(input.email)
    if (!user) {
      throw new ORPCError('NOT_FOUND', { message: '用户不存在。' })
    }
    const limit = await tryPasswordResetByTargetRateLimit(user.id)
    if (limit.exceeded) {
      throw new ORPCError('TOO_MANY_REQUESTS', { message: '该用户的重置邮件发送过于频繁，请稍后再试。' })
    }
    const { token } = await issueResetToken(user.id)
    const origin = new URL(context.request.url).origin
    const link = `${origin}/admin/signin?action=resetpassword&token=${encodeURIComponent(token)}`
    await sendPasswordResetEmail(user, link)
    recordAuditEventFromContext(context, {
      action: 'password_reset_sent',
      resourceType: 'user',
      resourceId: String(user.id),
    })
    return { success: true }
  })

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
      targetId = BigInt(input.userId)
    } catch {
      throw new ORPCError('BAD_REQUEST', { message: '用户 ID 无效。' })
    }
    const target = await findUserById(targetId)
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
    const result = await bulkApproveCommentsForUser(BigInt(input.userId))
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
    const result = await bulkDeleteCommentsForUser(BigInt(input.userId))
    recordAuditEventFromContext(context, {
      action: 'comments_bulk_deleted',
      resourceType: 'comment',
      resourceId: input.userId,
      details: { count: result.deleted },
    })
    return result
  })

export const adminUsersRouter = {
  list,
  get,
  update,
  softDelete,
  restore,
  mute,
  updateRole,
  inviteAuthor,
  sendPasswordReset,
  revokeSession,
  revokeAllSessions,
  bulkApproveComments,
  bulkDeleteComments,
}
