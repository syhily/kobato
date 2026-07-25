import type { RegistrationResponseJSON } from '@simplewebauthn/server'

import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { isPasskeyEnabled } from '@/server/domains/auth/passkey-gate'
import {
  deleteCredential,
  generateRegistrationOptions,
  listCredentials,
  setPasskeyForce,
  verifyRegistrationResponse,
} from '@/server/domains/auth/passkey-service'
import { MIN_PASSWORD_LENGTH, PASSWORD_COMPLEXITY_RE } from '@/server/domains/auth/schema'
import { revokeOwnSessionWithGuard } from '@/server/domains/auth/session-guard'
import { updateAccountPassword, updateAccountProfile } from '@/server/domains/users/services/account'
import { authedProc } from '@/server/http/orpc-base'
import { findSafeUserById } from '@/server/infra/db/operations/user'
import {
  tryPasskeyDeleteRateLimit,
  tryPasskeyRegisterBeginRateLimit,
  tryPasskeyRegisterFinishRateLimit,
  tryPasskeySetForceRateLimit,
  tryRateLimit,
} from '@/server/infra/rate-limit'
import { idFromString } from '@/shared/utils/id'
import { isRecord } from '@/shared/utils/type-guards'

function isRegistrationResponseJSON(value: unknown): value is RegistrationResponseJSON {
  if (!isRecord(value)) {
    return false
  }
  const id = value.id
  const rawId = value.rawId
  const resp = value.response
  const type = value.type
  if (typeof id !== 'string' || typeof rawId !== 'string' || typeof type !== 'string' || !isRecord(resp)) {
    return false
  }
  return typeof resp.clientDataJSON === 'string' && typeof resp.attestationObject === 'string'
}

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
  newPassword: z
    .string()
    .min(MIN_PASSWORD_LENGTH)
    .max(128)
    .regex(PASSWORD_COMPLEXITY_RE, '密码必须包含至少一个大写字母、一个小写字母和一个数字'),
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
    const { viewer, session, db } = context
    const currentSession = input.id === session.id
    const { targetUserId } = await revokeOwnSessionWithGuard(db, input.id, viewer)
    if (targetUserId !== null) {
      recordAuditEventFromContext(context, {
        action: 'session_revoked',
        resourceType: 'session',
        resourceId: input.id,
        details: { currentSession, targetUserId: String(targetUserId) },
      })
    }
    return { success: true, currentSession }
  })

// ─── Passkey procedures ─────────────────────────────────

const passkeyList = authedProc
  .route({ method: 'GET', path: '/account/passkeys' })
  .output(
    z.object({
      credentials: z.array(
        z.object({
          id: z.string(),
          deviceName: z.string().nullable(),
          createdAt: z.string(),
          backedUp: z.boolean(),
        }),
      ),
    }),
  )
  .handler(async ({ context }) => {
    if (!isPasskeyEnabled()) {
      throw new ORPCError('BAD_REQUEST', { message: 'Passkey 登录未启用。' })
    }
    const { db, viewer } = context
    const credentials = await listCredentials(db, idFromString(viewer.userId))
    return {
      credentials: credentials.map((c) => ({
        id: c.id,
        deviceName: c.deviceName,
        createdAt: c.createdAt.toISOString(),
        backedUp: c.backedUp,
      })),
    }
  })

const passkeyRegisterBegin = authedProc
  .route({ method: 'POST', path: '/account/passkeys/register-begin' })
  .input(z.object({ deviceName: z.string().max(100).optional() }))
  .output(z.object({ options: z.any() }))
  .handler(async ({ input, context }) => {
    if (!isPasskeyEnabled()) {
      throw new ORPCError('BAD_REQUEST', { message: 'Passkey 登录未启用。' })
    }
    const { db, viewer, clientAddress } = context
    const limit = await tryPasskeyRegisterBeginRateLimit(clientAddress)
    if (limit.exceeded) {
      throw new ORPCError('TOO_MANY_REQUESTS', { message: '操作过于频繁，请稍后再试。' })
    }
    const dbUser = await findSafeUserById(db, idFromString(viewer.userId))
    if (!dbUser) {
      throw new ORPCError('NOT_FOUND', { message: '用户不存在。' })
    }
    const { options } = await generateRegistrationOptions(db, dbUser, input.deviceName)
    return { options }
  })

const passkeyRegisterFinish = authedProc
  .route({ method: 'POST', path: '/account/passkeys/register-finish' })
  .input(
    z.object({
      response: z.any(),
      deviceName: z.string().max(100).optional(),
      challenge: z.string().min(1),
    }),
  )
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input, context }) => {
    if (!isPasskeyEnabled()) {
      throw new ORPCError('BAD_REQUEST', { message: 'Passkey 登录未启用。' })
    }
    const { db, viewer, clientAddress } = context
    const limit = await tryPasskeyRegisterFinishRateLimit(clientAddress)
    if (limit.exceeded) {
      throw new ORPCError('TOO_MANY_REQUESTS', { message: '操作过于频繁，请稍后再试。' })
    }
    const dbUser = await findSafeUserById(db, idFromString(viewer.userId))
    if (!dbUser) {
      throw new ORPCError('NOT_FOUND', { message: '用户不存在。' })
    }
    if (!isRegistrationResponseJSON(input.response)) {
      throw new ORPCError('BAD_REQUEST', { message: '无效的 Passkey 响应格式。' })
    }
    await verifyRegistrationResponse(db, dbUser, {
      response: input.response,
      deviceName: input.deviceName,
      challenge: input.challenge,
    })
    recordAuditEventFromContext(context, {
      action: 'passkey_registered',
      resourceType: 'user',
      resourceId: viewer.userId,
    })
    return { success: true }
  })

const passkeyDelete = authedProc
  .route({ method: 'POST', path: '/account/passkeys/delete' })
  .input(z.object({ credentialId: z.string().min(1) }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input, context }) => {
    if (!isPasskeyEnabled()) {
      throw new ORPCError('BAD_REQUEST', { message: 'Passkey 登录未启用。' })
    }
    const { db, viewer, clientAddress } = context
    const limit = await tryPasskeyDeleteRateLimit(clientAddress)
    if (limit.exceeded) {
      throw new ORPCError('TOO_MANY_REQUESTS', { message: '操作过于频繁，请稍后再试。' })
    }
    const userId = idFromString(viewer.userId)
    const ok = await deleteCredential(db, input.credentialId, userId)
    if (!ok) {
      throw new ORPCError('NOT_FOUND', { message: '凭据不存在。' })
    }
    recordAuditEventFromContext(context, {
      action: 'passkey_deleted',
      resourceType: 'user',
      resourceId: viewer.userId,
    })
    return { success: true }
  })

const passkeySetForce = authedProc
  .route({ method: 'POST', path: '/account/passkeys/set-force' })
  .input(z.object({ force: z.boolean() }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input, context }) => {
    if (!isPasskeyEnabled()) {
      throw new ORPCError('BAD_REQUEST', { message: 'Passkey 登录未启用。' })
    }
    const { db, viewer, clientAddress } = context
    const limit = await tryPasskeySetForceRateLimit(clientAddress)
    if (limit.exceeded) {
      throw new ORPCError('TOO_MANY_REQUESTS', { message: '操作过于频繁，请稍后再试。' })
    }
    await setPasskeyForce(db, idFromString(viewer.userId), input.force)
    recordAuditEventFromContext(context, {
      action: 'passkey_force_changed',
      resourceType: 'user',
      resourceId: viewer.userId,
      details: { force: input.force },
    })
    return { success: true }
  })

export const accountRouter = {
  updateProfile,
  updatePassword,
  revokeSession,
  passkeyList,
  passkeyRegisterBegin,
  passkeyRegisterFinish,
  passkeyDelete,
  passkeySetForce,
}
