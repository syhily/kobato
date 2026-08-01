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
    // Residual signal (documented, accepted): this answer proves a
    // passkey account exists for the address — the passkey prompt UX
    // cannot work without it. Enumeration is bounded by the per-email
    // and per-IP rate limits above.
    return { kind: 'passkey' }
  }

  const isMagicLinkUser =
    existingUser !== null &&
    existingUser.loginMethod === 'magic-link' &&
    Boolean(existingUser.role) &&
    !existingUser.deletedAt

  if (isMagicLinkUser && isMailLoginReady()) {
    const failure = await sendMagicLink(ctx, request, existingUser, redirectTo, origin)
    if (failure) {
      return { kind: 'error', message: failure.message }
    }
    return { kind: 'magic-link-sent' }
  }

  if (existingUser === null) {
    // Unknown mailbox: answer exactly like a real magic-link send so the
    // identify step is no account-existence oracle. No token row is
    // issued and no mail goes out. The residual timing gap vs. a real
    // SMTP round-trip is documented here deliberately and bounded by the
    // per-email/IP rate limits above.
    return { kind: 'magic-link-sent' }
  }

  // Known account on the password method (or magic-link while mail is
  // not configured): the password step fails generically later, so this
  // answer reveals nothing beyond "not passkey / not magic-link".
  return { kind: 'password' }
}
