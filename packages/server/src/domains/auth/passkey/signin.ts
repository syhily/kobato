// Passkey signin flow — verify the WebAuthn assertion and establish
// the session.

import type { AuthFlowResult, SigninFlowContext } from '@kobato/server/domains/auth/services/shared'

import { isPasskeyEnabled } from '@kobato/server/domains/auth/passkey/gate'
import { verifyAuthenticationResponse } from '@kobato/server/domains/auth/passkey/service'
import { establishLoginSession } from '@kobato/server/domains/auth/primitives'
import { tryPasskeyAuthFinishRateLimit } from '@kobato/server/infra/rate-limit'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'

export async function signInWithPasskey(
  ctx: SigninFlowContext,
  request: Request,
  formData: FormData,
  redirectTo: string,
): Promise<AuthFlowResult> {
  const { db, session, clientAddress } = ctx
  if (!isPasskeyEnabled()) {
    return { type: 'error', message: 'Passkey 登录未启用。' }
  }
  const rawResponse = formData.get('passkey_response')
  const rawChallenge = formData.get('passkey_challenge')
  if (!rawResponse || typeof rawResponse !== 'string' || !rawChallenge || typeof rawChallenge !== 'string') {
    return { type: 'error', message: 'Passkey 响应缺失。' }
  }
  let response: unknown
  try {
    response = JSON.parse(rawResponse)
  } catch {
    return { type: 'error', message: 'Passkey 响应格式错误。' }
  }
  const limit = await tryPasskeyAuthFinishRateLimit(clientAddress)
  if (limit.exceeded) {
    return { type: 'error', message: '操作过于频繁，请稍后再试。' }
  }
  try {
    const result = await verifyAuthenticationResponse(
      db,
      // parsed JSON validated by verifyAuthenticationResponse
      unsafeCast<Parameters<typeof verifyAuthenticationResponse>[1]>(response),
      rawChallenge,
    )
    const established = await establishLoginSession(db, session, result.user, request, clientAddress, {
      authMethod: 'passkey',
    })
    return { type: 'redirect', to: redirectTo, setCookie: established.setCookie }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Passkey 验证失败，请重试。'
    return { type: 'error', message }
  }
}
