// Identify step of the identifier-first signin: resolve which signin
// method an account uses; the answer drives the client UI — passkey
// prompt, "check your mailbox" notice, or the password field.

import { z } from 'zod'

import type { ErrorMessageDescriptor } from '@/shared/contracts/api-error'

import { isPasskeySigninUser } from '@/server/domains/auth/passkey/gate'
import { sendMagicLink } from '@/server/domains/auth/services/magic-link'
import {
  authFlowError,
  formFieldString,
  isMailLoginReady,
  type AuthFlowError,
  type SigninFlowContext,
} from '@/server/domains/auth/services/shared'
import { findUserByEmail } from '@/server/infra/db/operations/user'
import { tryRateLimit, trySignInByEmailRateLimit } from '@/server/infra/rate-limit'

export type IdentifyResult =
  | { kind: 'passkey' }
  | { kind: 'password' }
  | { kind: 'magic-link-sent' }
  | { kind: 'error'; message: string; descriptor?: ErrorMessageDescriptor }

const emailSchema = z.email()

function identifyError(flow: AuthFlowError): IdentifyResult {
  return {
    kind: 'error',
    message: flow.message,
    ...(flow.descriptor === undefined ? {} : { descriptor: flow.descriptor }),
  }
}

export async function handleIdentify(
  ctx: SigninFlowContext,
  request: Request,
  formData: FormData,
  redirectTo: string,
): Promise<IdentifyResult> {
  const { db, clientAddress } = ctx
  const email = formFieldString(formData, 'email')
  if (!z.validate(emailSchema, email)) {
    return identifyError(authFlowError('auth.signin.error.invalidEmail'))
  }

  const [loginLimit, signInEmailLimit] = await Promise.all([
    tryRateLimit(clientAddress),
    trySignInByEmailRateLimit(email),
  ])
  if (loginLimit.exceeded || signInEmailLimit.exceeded) {
    return identifyError(authFlowError('auth.signin.error.tooManyAttempts'))
  }

  const existingUser = await findUserByEmail(db, email)

  if (isPasskeySigninUser(existingUser)) {
    // Accepted residual signal: this answer proves a passkey account exists.
    return { kind: 'passkey' }
  }

  const isMagicLinkUser =
    existingUser?.loginMethod === 'magic-link' && Boolean(existingUser.role) && !existingUser.deletedAt

  if (isMagicLinkUser && isMailLoginReady()) {
    const failure = await sendMagicLink(ctx, request, existingUser, redirectTo)
    if (failure) {
      return { kind: 'error', message: failure.descriptor.fallbackMessage, descriptor: failure.descriptor }
    }
    return { kind: 'magic-link-sent' }
  }

  if (existingUser === null) {
    // Unknown mailbox answers like a real send — no account-existence oracle.
    return { kind: 'magic-link-sent' }
  }

  // Password answer reveals nothing beyond "not passkey / not magic-link".
  return { kind: 'password' }
}
