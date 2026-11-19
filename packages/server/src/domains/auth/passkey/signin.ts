import type { AuthFlowResult, SigninFlowContext } from '@kobato/server/domains/auth/services/shared.ts'

import { isPasskeyEnabled } from '@kobato/server/domains/auth/passkey/gate.ts'
import { verifyAuthenticationResponse } from '@kobato/server/domains/auth/passkey/service.ts'
import { establishLoginSession } from '@kobato/server/domains/auth/primitives.ts'
import { authFlowError } from '@kobato/server/domains/auth/services/shared.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'
import { tryPasskeyAuthFinishRateLimit } from '@kobato/server/infra/rate-limit.ts'
import { unsafeCast } from '@kobato/utils/unsafe-cast.ts'

export async function signInWithPasskey(
  ctx: SigninFlowContext,
  request: Request,
  formData: FormData,
  redirectTo: string,
): Promise<AuthFlowResult> {
  const { db, session, clientAddress } = ctx
  if (!isPasskeyEnabled()) {
    return authFlowError('auth.passkey.error.disabled')
  }
  const rawResponse = formData.get('passkey_response')
  const rawChallenge = formData.get('passkey_challenge')
  if (!rawResponse || typeof rawResponse !== 'string' || !rawChallenge || typeof rawChallenge !== 'string') {
    return authFlowError('auth.passkey.error.responseMissing')
  }
  let response: unknown
  try {
    response = JSON.parse(rawResponse)
  } catch {
    return authFlowError('auth.passkey.error.responseInvalid')
  }
  const limit = await tryPasskeyAuthFinishRateLimit(clientAddress)
  if (limit.exceeded) {
    return authFlowError('auth.signin.error.tooFrequent')
  }
  try {
    const result = await verifyAuthenticationResponse(
      db,
      unsafeCast<Parameters<typeof verifyAuthenticationResponse>[1]>(response),
      rawChallenge,
    )
    const established = await establishLoginSession(db, session, result.user, request, clientAddress, {
      authMethod: 'passkey',
    })
    return { type: 'redirect', to: redirectTo, setCookie: established.setCookie }
  } catch (err) {
    // Domain failures from the passkey service already carry a descriptor; an upstream
    // non-Error rejection falls back to the generic catalog copy.
    if (err instanceof DomainError && err.descriptor !== undefined) {
      return { type: 'error', message: err.message, descriptor: err.descriptor }
    }
    if (err instanceof Error) {
      // Third-party (SimpleWebAuthn) technical message, surfaced raw.
      return { type: 'error', message: err.message }
    }
    return authFlowError('auth.passkey.error.verifyFailed')
  }
}
