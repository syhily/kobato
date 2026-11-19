import type { ErrorMessageDescriptor } from '@kobato/contracts/api-error.ts'

import { findUserById } from '@kobato/db/operations/user.ts'
import { recordAuditEvent } from '@kobato/server/domains/audit/services/record.ts'
import { establishLoginSession } from '@kobato/server/domains/auth/primitives.ts'
import {
  authFlowError,
  formFieldString,
  type AuthFlowResult,
  type SigninFlowContext,
} from '@kobato/server/domains/auth/services/shared.ts'
import { consumeToken, issueSignInLinkToken } from '@kobato/server/domains/auth/verification-tokens.ts'
import { resolveSiteOrigin } from '@kobato/server/domains/settings/site-origin.ts'
import { sendSignInLink } from '@kobato/server/infra/email/sender.ts'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'
import { tryOtpSendByEmailRateLimit, tryOtpSendRateLimit, tryRateLimit } from '@kobato/server/infra/rate-limit.ts'

const log = getLogger('auth.magic-link')

export async function sendMagicLink(
  ctx: SigninFlowContext,
  request: Request,
  dbUser: { id: number; name: string; email: string },
  redirectTo: string,
): Promise<{ descriptor: ErrorMessageDescriptor } | null> {
  const { db, clientAddress } = ctx
  const [ipLimit, emailLimit] = await Promise.all([
    tryOtpSendRateLimit(clientAddress),
    tryOtpSendByEmailRateLimit(dbUser.email),
  ])
  if (ipLimit.exceeded || emailLimit.exceeded) {
    return { descriptor: descriptorFor('auth.magicLink.error.sendTooFrequent') }
  }

  const { token } = issueSignInLinkToken(db, dbUser.id)
  const origin = resolveSiteOrigin(request)
  const link = `${origin}/admin/signin?action=magiclink&token=${encodeURIComponent(token)}&redirect_to=${encodeURIComponent(redirectTo)}`

  try {
    const result = await sendSignInLink(dbUser, link)
    if (!result.ok) {
      return { descriptor: descriptorFor('auth.magicLink.error.sendFailed') }
    }
  } catch (error) {
    log.error('Magic-link send failed unexpectedly', { email: dbUser.email, error })
    return { descriptor: descriptorFor('auth.magicLink.error.sendFailed') }
  }

  recordAuditEvent({
    action: 'magic_link_sent',
    resourceType: 'user',
    resourceId: String(dbUser.id),
    actorId: dbUser.id,
    ipAddress: clientAddress,
    userAgent: request.headers.get('User-Agent'),
    details: { email: dbUser.email },
  })
  return null
}

export async function handleMagicLinkConsume(
  ctx: SigninFlowContext,
  request: Request,
  formData: FormData,
  redirectTo: string,
): Promise<AuthFlowResult> {
  const { db, session, clientAddress } = ctx
  const rawToken = formFieldString(formData, 'magic_token')
  if (!rawToken) {
    return authFlowError('auth.magicLink.error.invalidLink')
  }

  const limit = await tryRateLimit(clientAddress)
  if (limit.exceeded) {
    return authFlowError('auth.signin.error.tooFrequent')
  }

  const result = await consumeToken(db, rawToken, 'signin-link')
  if (result === null) {
    return authFlowError('auth.magicLink.error.invalidLink')
  }

  const dbUser = await findUserById(db, result.userId)
  if (!dbUser?.role || dbUser.deletedAt) {
    return authFlowError('auth.signin.error.accountCannotSignIn')
  }

  const established = await establishLoginSession(db, session, dbUser, request, clientAddress, {
    authMethod: 'magic-link',
  })
  return { type: 'redirect', to: redirectTo, setCookie: established.setCookie }
}
