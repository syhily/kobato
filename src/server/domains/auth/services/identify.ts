// Identify step of the identifier-first signin: given only an email,
// resolve which signin method the account uses. The answer drives the
// client UI — passkey prompt, "check your mailbox" notice, or the
// password field.

import { z } from 'zod'

import { isPasskeySigninUser } from '@/server/domains/auth/passkey/gate'
import { sendMagicLink } from '@/server/domains/auth/services/magic-link'
import { formFieldString, isMailLoginReady, type SigninFlowContext } from '@/server/domains/auth/services/shared'
import { findUserByEmail } from '@/server/infra/db/operations/user'
import { tryRateLimit, trySignInByEmailRateLimit } from '@/server/infra/rate-limit'

export type IdentifyResult =
  | { kind: 'passkey' }
  | { kind: 'password' }
  | { kind: 'magic-link-sent' }
  | { kind: 'error'; message: string }

const emailSchema = z.email()

export async function handleIdentify(
  ctx: SigninFlowContext,
  request: Request,
  formData: FormData,
  redirectTo: string,
  origin: string,
): Promise<IdentifyResult> {
  const { db, clientAddress } = ctx
  const email = formFieldString(formData, 'email')
  if (!emailSchema.safeParse(email).success) {
    return { kind: 'error', message: '请填写正确的邮箱地址。' }
  }

  const [loginLimit, signInEmailLimit] = await Promise.all([
    tryRateLimit(clientAddress),
    trySignInByEmailRateLimit(email),
  ])
  if (loginLimit.exceeded || signInEmailLimit.exceeded) {
    return { kind: 'error', message: '登录失败次数过多，请稍后再试。' }
  }

  const existingUser = await findUserByEmail(db, email)

  if (isPasskeySigninUser(existingUser)) {
    return { kind: 'passkey' }
  }

  if (
    existingUser !== null &&
    existingUser.loginMethod === 'magic-link' &&
    Boolean(existingUser.role) &&
    !existingUser.deletedAt &&
    isMailLoginReady()
  ) {
    const failure = await sendMagicLink(ctx, request, existingUser, redirectTo, origin)
    if (failure) {
      return { kind: 'error', message: failure.message }
    }
    return { kind: 'magic-link-sent' }
  }

  // Unknown mailboxes land here too — the password step fails generically
  // later, so the identify answer never reveals account existence.
  return { kind: 'password' }
}
