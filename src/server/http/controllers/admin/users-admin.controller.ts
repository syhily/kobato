import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { recordAuditEventFromContext } from '@/server/domains/audit/service'
import { revokeAllSessionsOfUser } from '@/server/domains/auth/session-storage'
import { issueResetToken, issueSetupToken, revokeTokensFor } from '@/server/domains/auth/verification-tokens'
import { fetchAdminUserDto, muteAdminUser } from '@/server/domains/users/service'
import { adminProc } from '@/server/http/orpc-base'
import {
  countAdmins,
  findUserByEmail,
  findUserById,
  insertAuthor,
  softDeleteUserById,
  updateUserRole,
} from '@/server/infra/db/operations/user'
import { sendAuthorInvite, sendPasswordReset as sendPasswordResetEmail } from '@/server/infra/email/sender'
import { getLogger } from '@/server/infra/logger'
import {
  tryInviteByEmailRateLimit,
  tryInviteRateLimit,
  tryPasswordResetByTargetRateLimit,
} from '@/server/infra/rate-limit'
import { adminUserDto } from '@/shared/contracts/users'
import { idFromString } from '@/shared/utils/id'

const successOutput = z.object({ success: z.boolean() })

const mute = adminProc
  .route({ method: 'POST', path: '/admin/users/mute' })
  .input(z.object({ id: z.string().min(1), muted: z.boolean() }))
  .output(z.object({ user: adminUserDto }))
  .handler(async ({ input, context }) => {
    const updated = await muteAdminUser(context.db, idFromString(input.id), input.muted)
    if (!updated) {
      throw new ORPCError('NOT_FOUND', { message: '用户不存在或为管理员（管理员不可禁言）' })
    }
    const dto = await fetchAdminUserDto(context.db, updated.id)
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
    const targetId = idFromString(userId)
    const target = await findUserById(context.db, targetId)
    if (!target) {
      throw new ORPCError('NOT_FOUND', { message: '用户不存在。' })
    }
    if (target.role === 'admin' && input.role !== 'admin') {
      const adminCount = await countAdmins(context.db)
      if (adminCount <= 1) {
        throw new ORPCError('CONFLICT', { message: '不能降级唯一的管理员。' })
      }
    }
    const updated = await updateUserRole(context.db, targetId, input.role)
    if (updated) {
      await revokeAllSessionsOfUser(targetId)
      recordAuditEventFromContext(context, {
        action: 'user_role_changed',
        resourceType: 'user',
        resourceId: userId,
        details: { from: target.role, to: input.role },
      })
    }
    const dto = await fetchAdminUserDto(context.db, targetId)
    return { user: dto }
  })

const inviteAuthor = adminProc
  .route({ method: 'POST', path: '/admin/users/invite-author' })
  .input(z.object({ email: z.email().min(1), name: z.string().min(1).max(100) }))
  .output(successOutput)
  .handler(async ({ input, context }) => {
    const existing = await findUserByEmail(context.db, input.email)
    if (existing !== null) {
      throw new ORPCError('CONFLICT', { message: '该邮箱已被注册。' })
    }
    const [ipLimit, emailLimit] = await Promise.all([
      tryInviteRateLimit(context.clientAddress),
      tryInviteByEmailRateLimit(idFromString(context.viewer.userId), input.email),
    ])
    if (ipLimit.exceeded || emailLimit.exceeded) {
      throw new ORPCError('TOO_MANY_REQUESTS', { message: '邀请发送过于频繁，请稍后再试。' })
    }
    const [user] = await insertAuthor(context.db, input.name, input.email)
    if (!user) {
      throw new ORPCError('INTERNAL_SERVER_ERROR', { message: '创建作者账户失败。' })
    }
    const { token } = await issueSetupToken(context.db, user.id)
    const origin = new URL(context.request.url).origin
    const link = `${origin}/admin/signin?action=accept-invite&token=${encodeURIComponent(token)}`
    const inviterSession = context.session.get('user')
    const inviter = inviterSession?.name ?? '管理员'
    const sendResult = await sendAuthorInvite(user, link, inviter, inviterSession?.email)
    if (!sendResult.ok) {
      await revokeTokensFor(context.db, user.id, 'author-invite')
      await softDeleteUserById(context.db, user.id)
      getLogger('users.invite').error('author invite email failed', {
        email: input.email,
        reason: sendResult.reason,
        message: sendResult.message,
      })
      recordAuditEventFromContext(context, {
        action: 'author_invite_rolled_back',
        resourceType: 'user',
        resourceId: String(user.id),
        details: { email: input.email, reason: sendResult.reason },
      })
      throw new ORPCError('BAD_GATEWAY', {
        message: '邮件发送失败，已回滚账户创建。',
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
    const user = await findUserByEmail(context.db, input.email)
    if (!user) {
      throw new ORPCError('NOT_FOUND', { message: '用户不存在' })
    }
    const limit = await tryPasswordResetByTargetRateLimit(user.id)
    if (limit.exceeded) {
      throw new ORPCError('TOO_MANY_REQUESTS', { message: '该用户的重置邮件发送过于频繁，请稍后再试。' })
    }
    const { token } = await issueResetToken(context.db, user.id)
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

export const adminUsersAdminRouter = {
  mute,
  updateRole,
  inviteAuthor,
  sendPasswordReset,
}
