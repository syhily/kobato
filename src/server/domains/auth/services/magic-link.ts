// Magic-link signin flow — send the one-time link (identify step) and
// consume it (confirm step). The link lands on
// `/admin/signin?action=magiclink&token=…`, where the loader peeks the
// token and renders a confirm button; only the POST here consumes it —
// mail-client prefetchers never burn the token.

import { recordAuditEvent } from '@/server/domains/audit/services/record'
import { establishLoginSession } from '@/server/domains/auth/primitives'
import { formFieldString, type AuthFlowResult, type SigninFlowContext } from '@/server/domains/auth/services/shared'
import { consumeToken, issueSignInLinkToken } from '@/server/domains/auth/verification-tokens'
import { findUserById } from '@/server/infra/db/operations/user'
import { sendSignInLink } from '@/server/infra/email/sender'
import { getLogger } from '@/server/infra/logger'
import { tryOtpSendByEmailRateLimit, tryOtpSendRateLimit, tryRateLimit } from '@/server/infra/rate-limit'

const log = getLogger('auth.magic-link')

/**
 * Issue + send + audit the one-time signin link for a known user.
 * Returns an error message on throttling or send failure; `null` on
 * success (the caller decides the response shape — identify answers
 * with a deliberately generic message either way).
 */
export async function sendMagicLink(
  ctx: SigninFlowContext,
  request: Request,
  dbUser: { id: number; name: string; email: string },
  redirectTo: string,
  origin: string,
): Promise<{ message: string } | null> {
  const { db, clientAddress } = ctx
  const [ipLimit, emailLimit] = await Promise.all([
    tryOtpSendRateLimit(clientAddress),
    tryOtpSendByEmailRateLimit(dbUser.email),
  ])
  if (ipLimit.exceeded || emailLimit.exceeded) {
    return { message: '发送过于频繁，请稍后再试。' }
  }

  const { token } = issueSignInLinkToken(db, dbUser.id)
  const link = `${origin}/admin/signin?action=magiclink&token=${encodeURIComponent(token)}&redirect_to=${encodeURIComponent(redirectTo)}`

  try {
    const result = await sendSignInLink(dbUser, link)
    if (!result.ok) {
      return { message: '登录链接发送失败，请稍后重试。' }
    }
  } catch (error) {
    log.error('Magic-link send failed unexpectedly', { email: dbUser.email, error })
    return { message: '登录链接发送失败，请稍后重试。' }
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
    return { type: 'error', message: '链接无效或已过期，请重新获取。' }
  }

  // Cheap IP throttle before the token lookup — the token itself is
  // 256-bit, so this only guards against hammering the DB.
  const limit = await tryRateLimit(clientAddress)
  if (limit.exceeded) {
    return { type: 'error', message: '操作过于频繁，请稍后再试。' }
  }

  const result = await consumeToken(db, rawToken, 'signin-link')
  if (result === null) {
    return { type: 'error', message: '链接无效或已过期，请重新获取。' }
  }

  const dbUser = await findUserById(db, result.userId)
  if (!dbUser || !dbUser.role || dbUser.deletedAt) {
    return { type: 'error', message: '账户状态异常，无法登录。' }
  }

  const established = await establishLoginSession(db, session, dbUser, request, clientAddress, {
    authMethod: 'magic-link',
  })
  return { type: 'redirect', to: redirectTo, setCookie: established.setCookie }
}
