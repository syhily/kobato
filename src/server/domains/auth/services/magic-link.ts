// Magic-link signin: send the one-time link (identify step) and consume it (confirm
// step). Only the POST consumes the token, so mail-client prefetchers never burn it.

import type { ErrorMessageDescriptor } from '@/shared/contracts/api-error'

import { recordAuditEvent } from '@/server/domains/audit/services/record'
import { establishLoginSession } from '@/server/domains/auth/primitives'
import {
  authFlowError,
  formFieldString,
  type AuthFlowResult,
  type SigninFlowContext,
} from '@/server/domains/auth/services/shared'
import { consumeToken, issueSignInLinkToken } from '@/server/domains/auth/verification-tokens'
import { findUserById } from '@/server/infra/db/operations/user'
import { sendSignInLink } from '@/server/infra/email/sender'
import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { getLogger } from '@/server/infra/logger'
import { tryOtpSendByEmailRateLimit, tryOtpSendRateLimit, tryRateLimit } from '@/server/infra/rate-limit'
import { resolveSiteOrigin } from '@/shared/config/site-origin'

const log = getLogger('auth.magic-link')

/**
 * Send the one-time signin link; returns a descriptor on failure, `null` on success —
 * the caller answers generically either way.
 */
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
  // Resolved from the configured site: a request-supplied origin would let a spoofed
  // Host header point the emailed token at an attacker host.
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

  // Cheap IP throttle before the token lookup — guards DB hammering only.
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
