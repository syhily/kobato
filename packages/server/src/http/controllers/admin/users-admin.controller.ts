import { adminUsersAdminContract } from '@kobato/api/admin/users.ts'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record.ts'
import { deleteAllCredentials } from '@kobato/server/domains/auth/passkey/service.ts'
import { resolveSiteOrigin } from '@kobato/server/domains/settings/site-origin.ts'
import {
  fetchAdminUserDto,
  inviteAuthorWithRollback,
  muteUser,
  sendPasswordResetToUser,
  updateUserRoleWithGuard,
} from '@kobato/server/domains/users/services/admin.ts'
import { implementAdmin, localizedOrpcError, passkeyGuard } from '@kobato/server/http/orpc-base.ts'
import { createServerTranslator } from '@kobato/server/infra/i18n.ts'
import { tryInviteByEmailRateLimit, tryInviteRateLimit } from '@kobato/server/infra/rate-limit.ts'
import { idFromString } from '@kobato/utils/id.ts'

// Contract-first: method/path/input/output live in `@kobato/api/admin/users.ts`;
// this controller group implements the admin-action slice (admin base).
const impl = implementAdmin(adminUsersAdminContract)

const mute = impl.mute.handler(async ({ input, context }) => {
  const dto = await muteUser(context.db, idFromString(input.id), input.muted)
  recordAuditEventFromContext(context, {
    action: input.muted ? 'user_muted' : 'user_unmuted',
    resourceType: 'user',
    resourceId: input.id,
  })
  return { user: dto }
})

const updateRole = impl.updateRole.handler(async ({ input, context }) => {
  const targetId = idFromString(input.id)
  const updated = await updateUserRoleWithGuard(context.db, targetId, input.role, context.viewer.id)
  if (updated) {
    recordAuditEventFromContext(context, {
      action: 'user_role_changed',
      resourceType: 'user',
      resourceId: input.id,
      details: { from: updated.previousRole, to: input.role },
    })
  }
  const dto = await fetchAdminUserDto(context.db, targetId)
  return { user: dto }
})

const inviteAuthor = impl.inviteAuthor.handler(async ({ input, context }) => {
  const [ipLimit, emailLimit] = await Promise.all([
    tryInviteRateLimit(context.clientAddress),
    tryInviteByEmailRateLimit(idFromString(context.viewer.id), input.email),
  ])
  if (ipLimit.exceeded || emailLimit.exceeded) {
    throw localizedOrpcError(context, 'TOO_MANY_REQUESTS', 'users.error.inviteTooFrequent')
  }

  const origin = resolveSiteOrigin(context.request)
  // No display name on the account: the invite email greets the recipient in
  // the request locale instead of a hardcoded Chinese literal.
  const inviterName =
    context.viewer.name ??
    createServerTranslator(context.localization.locale).format('email.authorInvite.defaultInviter')

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

const sendPasswordReset = impl.sendPasswordReset.handler(async ({ input, context }) => {
  const user = await sendPasswordResetToUser(context.db, input.email, resolveSiteOrigin(context.request))

  recordAuditEventFromContext(context, {
    action: 'password_reset_sent',
    resourceType: 'user',
    resourceId: String(user.userId),
  })
  return { success: true }
})

// The passkey gate rides AFTER the base guard chain (role gate → domain-error
// translation), matching the pre-contract `.use(passkeyGuard)` order.
const clearPasskeys = impl.clearPasskeys.use(passkeyGuard).handler(async ({ input, context }) => {
  const targetId = idFromString(input.id)
  await deleteAllCredentials(context.db, targetId)
  const dto = await fetchAdminUserDto(context.db, targetId)
  if (!dto) {
    throw localizedOrpcError(context, 'NOT_FOUND', 'users.error.notFound')
  }
  recordAuditEventFromContext(context, {
    action: 'passkeys_cleared',
    resourceType: 'user',
    resourceId: input.id,
  })
  return { user: dto }
})

export const adminUsersAdminRouter = impl.router({
  mute,
  updateRole,
  inviteAuthor,
  sendPasswordReset,
  clearPasskeys,
})
