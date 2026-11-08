import type { RegistrationResponseJSON } from '@simplewebauthn/server'

import { z } from 'zod'

import { formatUaLabel } from '@/server/domains/analytics/ua-parse'
import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { isPasskeyEnabled } from '@/server/domains/auth/passkey/gate'
import {
  deleteCredential,
  generateRegistrationOptions,
  listCredentials,
  setLoginMethod,
  verifyRegistrationResponse,
} from '@/server/domains/auth/passkey/service'
import { newPasswordSchema } from '@/server/domains/auth/schema'
import { listSessionsByUser } from '@/server/domains/auth/services/sessions'
import { isMailLoginReady } from '@/server/domains/auth/services/shared'
import { revokeOwnSessionWithGuard } from '@/server/domains/auth/session-guard'
import { getAccountProfile, updateAccountPassword, updateAccountProfile } from '@/server/domains/users/services/account'
import { authedProc, localizedOrpcError, passkeyGuard } from '@/server/http/orpc-base'
import { findSafeUserById } from '@/server/infra/db/operations/user'
import { createServerTranslator } from '@/server/infra/i18n'
import {
  tryPasskeyDeleteRateLimit,
  tryPasskeyRegisterBeginRateLimit,
  tryPasskeyRegisterFinishRateLimit,
  tryPasskeySetForceRateLimit,
  tryRateLimit,
} from '@/server/infra/rate-limit'
import { accountProfileOutputSchema, accountSessionsOutputSchema } from '@/shared/contracts/admin'
import { loginMethodSchema } from '@/shared/contracts/users'
import { idFromString } from '@/shared/utils/id'
import { optionalHttpUrlSchema } from '@/shared/utils/safe-url'
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

// Schemas live next to the procedure that owns them; UI input types are
// inferred from the router via `InferRouterInputs`.
const updateProfileInput = z.object({
  name: z.string().min(1).max(50).optional(),
  // http(s)-only like the admin user-edit schema — a bare z.url() would
  // accept javascript:/data: hrefs into the profile link.
  link: optionalHttpUrlSchema.nullable(),
  badgeName: z.string().max(20).optional().nullable(),
  badgeColor: z.string().max(7).optional().nullable(),
  badgeTextColor: z.string().max(7).optional().nullable(),
  receiveEmail: z.boolean().optional(),
})

const updatePasswordInput = z.object({
  oldPassword: z.string().min(1),
  newPassword: newPasswordSchema(),
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

// `/admin/me/profile`: the domain's full `AccountProfile` projection plus
// the two feature switches; raw service output, no projection here.
const profile = authedProc
  .route({ method: 'GET', path: '/account/profile' })
  .output(accountProfileOutputSchema)
  .handler(async ({ context }) => {
    const { db, viewer } = context
    const user = await getAccountProfile(db, idFromString(viewer.id))
    return { user, passkeyEnabled: isPasskeyEnabled(), mailReady: isMailLoginReady() }
  })

// Raw session rows — sorting and `isCurrent` stay in the route loader. The
// UA label is rendered HERE, at the perimeter: the detector dataset is
// server-only and the public/admin route whitelists must not import the
// analytics domain.
const sessions = authedProc
  .route({ method: 'GET', path: '/account/sessions' })
  .output(accountSessionsOutputSchema)
  .handler(async ({ context }) => {
    const rows = await listSessionsByUser(context.db, idFromString(context.viewer.id))
    const translator = createServerTranslator(context.localization.locale)
    return rows.map((row) => ({
      sid: row.sid,
      userId: row.userId,
      label: formatUaLabel(row.userAgent, row.platformHint, translator.format('auth.sessions.unknownDevice')),
      ip: row.ip,
      loginAt: row.loginAt,
      lastActiveAt: row.lastActiveAt,
      expiresAt: row.expiresAt,
    }))
  })

const updateProfile = authedProc
  .route({ method: 'POST', path: '/account/update-profile' })
  .input(updateProfileInput)
  .output(z.object({ user: accountUserOutput }))
  .handler(async ({ input, context }) => {
    const { viewer, db } = context
    const updated = await updateAccountProfile(db, idFromString(viewer.id), input, viewer.role)
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
      throw localizedOrpcError(context, 'TOO_MANY_REQUESTS', 'auth.signin.error.tooFrequent')
    }

    await updateAccountPassword(db, idFromString(viewer.id), input.oldPassword, input.newPassword, session.id)
    recordAuditEventFromContext(context, {
      action: 'password_changed',
      resourceType: 'user',
      resourceId: viewer.id,
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
  .use(passkeyGuard)
  .handler(async ({ context }) => {
    const { db, viewer } = context
    const credentials = await listCredentials(db, idFromString(viewer.id))
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
  .use(passkeyGuard)
  .handler(async ({ input, context }) => {
    const { db, viewer, clientAddress } = context
    const limit = await tryPasskeyRegisterBeginRateLimit(clientAddress)
    if (limit.exceeded) {
      throw localizedOrpcError(context, 'TOO_MANY_REQUESTS', 'auth.signin.error.tooFrequent')
    }
    const dbUser = await findSafeUserById(db, idFromString(viewer.id))
    if (!dbUser) {
      throw localizedOrpcError(context, 'NOT_FOUND', 'account.error.userNotFound')
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
  .use(passkeyGuard)
  .handler(async ({ input, context }) => {
    const { db, viewer, clientAddress } = context
    const limit = await tryPasskeyRegisterFinishRateLimit(clientAddress)
    if (limit.exceeded) {
      throw localizedOrpcError(context, 'TOO_MANY_REQUESTS', 'auth.signin.error.tooFrequent')
    }
    const dbUser = await findSafeUserById(db, idFromString(viewer.id))
    if (!dbUser) {
      throw localizedOrpcError(context, 'NOT_FOUND', 'account.error.userNotFound')
    }
    if (!isRegistrationResponseJSON(input.response)) {
      throw localizedOrpcError(context, 'BAD_REQUEST', 'account.error.passkeyResponseInvalid')
    }
    await verifyRegistrationResponse(db, dbUser, {
      response: input.response,
      deviceName: input.deviceName,
      challenge: input.challenge,
    })
    recordAuditEventFromContext(context, {
      action: 'passkey_registered',
      resourceType: 'user',
      resourceId: viewer.id,
    })
    return { success: true }
  })

const passkeyDelete = authedProc
  .route({ method: 'POST', path: '/account/passkeys/delete' })
  .input(z.object({ credentialId: z.string().min(1) }))
  .output(z.object({ success: z.boolean() }))
  .use(passkeyGuard)
  .handler(async ({ input, context }) => {
    const { db, viewer, clientAddress } = context
    const limit = await tryPasskeyDeleteRateLimit(clientAddress)
    if (limit.exceeded) {
      throw localizedOrpcError(context, 'TOO_MANY_REQUESTS', 'auth.signin.error.tooFrequent')
    }
    const userId = idFromString(viewer.id)
    const ok = await deleteCredential(db, input.credentialId, userId)
    if (!ok) {
      throw localizedOrpcError(context, 'NOT_FOUND', 'account.error.credentialNotFound')
    }
    recordAuditEventFromContext(context, {
      action: 'passkey_deleted',
      resourceType: 'user',
      resourceId: viewer.id,
    })
    return { success: true }
  })

const setLoginMethodProc = authedProc
  .route({ method: 'POST', path: '/account/login-method' })
  .input(z.object({ method: loginMethodSchema }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input, context }) => {
    const { db, viewer, clientAddress } = context
    const limit = await tryPasskeySetForceRateLimit(clientAddress)
    if (limit.exceeded) {
      throw localizedOrpcError(context, 'TOO_MANY_REQUESTS', 'auth.signin.error.tooFrequent')
    }
    if (input.method === 'passkey' && !isPasskeyEnabled()) {
      throw localizedOrpcError(context, 'BAD_REQUEST', 'auth.passkey.error.disabled')
    }
    if (input.method === 'magic-link' && !isMailLoginReady()) {
      throw localizedOrpcError(context, 'BAD_REQUEST', 'account.error.mailNotConfigured')
    }
    await setLoginMethod(db, idFromString(viewer.id), input.method)
    recordAuditEventFromContext(context, {
      action: 'login_method_changed',
      resourceType: 'user',
      resourceId: viewer.id,
      details: { method: input.method },
    })
    return { success: true }
  })

export const accountRouter = {
  profile,
  sessions,
  updateProfile,
  updatePassword,
  revokeSession,
  passkeyList,
  passkeyRegisterBegin,
  passkeyRegisterFinish,
  passkeyDelete,
  setLoginMethod: setLoginMethodProc,
}
