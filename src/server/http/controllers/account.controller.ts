import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { recordAuditEventFromContext } from '@/server/domains/audit/service'
import { findSessionMeta, revokeSessionById } from '@/server/domains/auth/repo'
import { MIN_PASSWORD_LENGTH } from '@/server/domains/auth/schema'
import { updateAccountPassword, updateAccountProfile } from '@/server/domains/users/services/account'
import { authedProc } from '@/server/http/orpc-base'
import { tryRateLimit } from '@/server/infra/rate-limit'
import { idFromString } from '@/shared/utils/id'

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
  newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(128),
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
    const { viewer, db } = context
    const updated = await updateAccountProfile(db, idFromString(viewer.userId), input, viewer.role)
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
    const { viewer, session, db, clientAddress } = context

    const limit = await tryRateLimit(clientAddress)
    if (limit.exceeded) {
      throw new ORPCError('TOO_MANY_REQUESTS', { message: '操作过于频繁，请稍后再试。' })
    }

    await updateAccountPassword(db, idFromString(viewer.userId), input.oldPassword, input.newPassword, session.id)
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
