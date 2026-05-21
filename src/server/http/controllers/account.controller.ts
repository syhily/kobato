import { ORPCError } from '@orpc/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

import { recordAuditEventFromContext } from '@/server/domains/audit/service'
import { findSessionMeta, revokeSessionById } from '@/server/domains/auth/repo'
import { revokeAllSessionsOfUser } from '@/server/domains/auth/session-storage'
import { authedProc } from '@/server/http/orpc-base'
import { findUserById, updateUserById } from '@/server/infra/db/operations/user'

// ─── Input schemas ──────────────────────────────────────
// Kept inline (was previously in `src/shared/contracts/account.ts`,
// which is deleted as part of the oRPC migration). Schemas live next
// to the procedure that owns them; UI input types are inferred from
// the router via `InferRouterInputs`.

const updateProfileInput = z.object({
  name: z.string().min(1).max(50).optional(),
  link: z.url().max(255).optional().nullable(),
  badgeName: z.string().max(20).optional().nullable(),
  badgeColor: z.string().max(7).optional().nullable(),
  badgeTextColor: z.string().max(7).optional().nullable(),
  receiveEmail: z.boolean().optional(),
})

const updatePasswordInput = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(6).max(128),
})

const revokeSessionInput = z.object({
  id: z.string().min(1),
})

// Safe subset of user fields exposed to the account owner.
// Deliberately excludes password, lastIp, lastUa, and admin-only counters.
const accountUserOutput = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  link: z.string().nullable(),
  badgeName: z.string().nullable(),
  badgeColor: z.string().nullable(),
  badgeTextColor: z.string().nullable(),
  role: z.enum(['admin', 'author', 'visitor']).nullable(),
  emailVerified: z.boolean(),
})

// ─── Procedures ─────────────────────────────────────────

const updateProfile = authedProc
  .route({ method: 'POST', path: '/account/update-profile' })
  .input(updateProfileInput)
  .output(z.object({ user: accountUserOutput }))
  .handler(async ({ input, context }) => {
    const { viewer } = context
    const userId = BigInt(viewer.userId)
    const dbUser = await findUserById(userId)
    if (!dbUser) {
      throw new ORPCError('NOT_FOUND', { message: '用户不存在。' })
    }
    const canSetBadge = viewer.role === 'admin' || viewer.role === 'author'
    const patch: Parameters<typeof updateUserById>[1] = {}
    if (input.name !== undefined) {
      patch.name = input.name
    }
    if (input.link !== undefined) {
      patch.link = input.link ?? undefined
    }
    if (input.receiveEmail !== undefined) {
      patch.receiveEmail = input.receiveEmail
    }
    if (canSetBadge) {
      if (input.badgeName !== undefined) {
        patch.badgeName = input.badgeName ?? undefined
      }
      if (input.badgeColor !== undefined) {
        patch.badgeColor = input.badgeColor ?? undefined
      }
      if (input.badgeTextColor !== undefined) {
        patch.badgeTextColor = input.badgeTextColor ?? undefined
      }
    }
    const updated = await updateUserById(userId, patch)
    if (!updated) {
      throw new ORPCError('NOT_FOUND', { message: '用户不存在。' })
    }
    return {
      user: {
        id: String(updated.id),
        name: updated.name,
        email: updated.email,
        link: updated.link,
        badgeName: updated.badgeName,
        badgeColor: updated.badgeColor,
        badgeTextColor: updated.badgeTextColor,
        role: updated.role,
        emailVerified: updated.emailVerified,
      },
    }
  })

const updatePassword = authedProc
  .route({ method: 'POST', path: '/account/update-password' })
  .input(updatePasswordInput)
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input, context }) => {
    const { viewer, session } = context
    const dbUser = await findUserById(BigInt(viewer.userId))
    if (!dbUser) {
      throw new ORPCError('NOT_FOUND', { message: '用户不存在。' })
    }
    const ok = await bcrypt.compare(input.oldPassword, dbUser.password)
    if (!ok) {
      throw new ORPCError('FORBIDDEN', { message: '原密码错误。' })
    }
    const hashed = await bcrypt.hash(input.newPassword, 12)
    await updateUserById(dbUser.id, { password: hashed })
    await revokeAllSessionsOfUser(dbUser.id, session.id)
    recordAuditEventFromContext(context, {
      action: 'password_changed',
      resourceType: 'user',
      resourceId: viewer.userId,
    })
    return { success: true }
  })

const revokeSession = authedProc
  .route({ method: 'POST', path: '/account/revoke-session' })
  .input(revokeSessionInput)
  .output(z.object({ success: z.boolean(), currentSession: z.boolean() }))
  .handler(async ({ input, context }) => {
    const { viewer, session } = context
    const currentSession = input.id === session.id
    const meta = await findSessionMeta(input.id)
    if (!meta) {
      return { success: true, currentSession }
    }
    if (meta.userId.toString() !== viewer.userId) {
      throw new ORPCError('FORBIDDEN', { message: '无权操作该会话。' })
    }
    await revokeSessionById(input.id, meta.userId)
    recordAuditEventFromContext(context, {
      action: 'session_revoked',
      resourceType: 'session',
      resourceId: input.id,
      details: { currentSession, targetUserId: String(meta.userId) },
    })
    return { success: true, currentSession }
  })

export const accountRouter = {
  updateProfile,
  updatePassword,
  revokeSession,
}
