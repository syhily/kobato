import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { deleteAllCredentials } from '@/server/domains/auth/passkey/service'
import {
  fetchAdminUserDto,
  inviteAuthorWithRollback,
  sendPasswordResetToUser,
  updateUserRoleWithGuard,
} from '@/server/domains/users/services/admin'
import { adminProc, passkeyGuard } from '@/server/http/orpc-base'
import { setUserMuted } from '@/server/infra/db/operations/user'
import { tryInviteByEmailRateLimit, tryInviteRateLimit } from '@/server/infra/rate-limit'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { adminUserDto } from '@/shared/contracts/users'
import { idFromString } from '@/shared/utils/id'

const successOutput = z.object({ success: z.boolean() })

const mute = adminProc
  .route({ method: 'POST', path: '/admin/users/mute' })
  .input(z.object({ id: z.string().min(1), muted: z.boolean() }))
  .output(z.object({ user: adminUserDto }))
  .handler(async ({ input, context }) => {
    const updated = await setUserMuted(context.db, idFromString(input.id), input.muted)
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
    const updated = await updateUserRoleWithGuard(context.db, targetId, input.role, context.viewer.id)
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
      tryInviteByEmailRateLimit(idFromString(context.viewer.id), input.email),
    ])
    if (ipLimit.exceeded || emailLimit.exceeded) {
      throw new ORPCError('TOO_MANY_REQUESTS', { message: '邀请发送过于频繁，请稍后再试。' })
    }

    const bundle = getBlogSettingsBundleSync()
    const origin = bundle?.siteIdentity?.website ?? new URL(context.request.url).origin
    const inviterName = context.viewer.name ?? '管理员'

    const result = await inviteAuthorWithRollback(
      context.db,
      input.name,
      input.email,
      origin,
      inviterName,
      context.viewer.email,
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
    const user = await sendPasswordResetToUser(
      context.db,
      input.email,
      getBlogSettingsBundleSync()?.siteIdentity?.website ?? new URL(context.request.url).origin,
    )

    recordAuditEventFromContext(context, {
      action: 'password_reset_sent',
      resourceType: 'user',
      resourceId: String(user.userId),
    })
    return { success: true }
  })

const clearPasskeys = adminProc
  .route({ method: 'POST', path: '/admin/users/clear-passkeys' })
  .input(z.object({ id: z.string().min(1) }))
  .output(z.object({ user: adminUserDto }))
  .use(passkeyGuard)
  .handler(async ({ input, context }) => {
    const targetId = idFromString(input.id)
    await deleteAllCredentials(context.db, targetId)
    const dto = await fetchAdminUserDto(context.db, targetId)
    if (!dto) {
      throw new ORPCError('NOT_FOUND', { message: '用户不存在' })
    }
    recordAuditEventFromContext(context, {
      action: 'passkeys_cleared',
      resourceType: 'user',
      resourceId: input.id,
    })
    return { user: dto }
  })

export const adminUsersAdminRouter = {
  mute,
  updateRole,
  inviteAuthor,
  sendPasswordReset,
  clearPasskeys,
}
