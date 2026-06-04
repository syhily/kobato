import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { recordAuditEventFromContext } from '@/server/domains/audit/service'
import {
  fetchAdminUserDto,
  inviteAuthorWithRollback,
  muteAdminUser,
  sendPasswordResetToUser,
  updateUserRoleWithGuard,
} from '@/server/domains/users/services/admin'
import { adminProc } from '@/server/http/orpc-base'
import { tryInviteByEmailRateLimit, tryInviteRateLimit } from '@/server/infra/rate-limit'
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
    const targetId = idFromString(input.id)
    const updated = await updateUserRoleWithGuard(context.db, targetId, input.role, context.viewer.userId)
    if (updated) {
      recordAuditEventFromContext(context, {
        action: 'user_role_changed',
        resourceType: 'user',
        resourceId: input.id,
        details: { from: updated.role, to: input.role },
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
    const [ipLimit, emailLimit] = await Promise.all([
      tryInviteRateLimit(context.clientAddress),
      tryInviteByEmailRateLimit(idFromString(context.viewer.userId), input.email),
    ])
    if (ipLimit.exceeded || emailLimit.exceeded) {
      throw new ORPCError('TOO_MANY_REQUESTS', { message: '邀请发送过于频繁，请稍后再试。' })
    }

    const origin = new URL(context.request.url).origin
    const inviterSession = context.session.get('user')
    const inviterName = inviterSession?.name ?? '管理员'

    const result = await inviteAuthorWithRollback(
      context.db,
      input.name,
      input.email,
      origin,
      inviterName,
      inviterSession?.email,
    )

    recordAuditEventFromContext(context, {
      action: 'author_invited',
      resourceType: 'user',
      resourceId: String(result.userId),
      details: { email: input.email },
    })
    return { success: true }
  })

const sendPasswordReset = adminProc
  .route({ method: 'POST', path: '/admin/users/send-password-reset' })
  .input(z.object({ email: z.email().min(1) }))
  .output(successOutput)
  .handler(async ({ input, context }) => {
    const user = await sendPasswordResetToUser(context.db, input.email, new URL(context.request.url).origin)

    recordAuditEventFromContext(context, {
      action: 'password_reset_sent',
      resourceType: 'user',
      resourceId: String(user.userId),
    })
    return { success: true }
  })

export const adminUsersAdminRouter = {
  mute,
  updateRole,
  inviteAuthor,
  sendPasswordReset,
}
