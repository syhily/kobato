import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { AuthFlowResult } from '@/server/domains/auth/otp-flow'
import type { BlogSession } from '@/server/domains/auth/session-storage'

import { recordAuditEvent } from '@/server/domains/audit/services/record'
import { isPasskeyEnabled } from '@/server/domains/auth/passkey-gate'
import { verifyAuthenticationResponse } from '@/server/domains/auth/passkey-service'
import { establishLoginSession } from '@/server/domains/auth/primitives'
import { updateLastLogin } from '@/server/infra/db/operations/user'
import { tryPasskeyAuthFinishRateLimit } from '@/server/infra/rate-limit'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

/**
 * `passkey` — finish a WebAuthn authentication ceremony and establish a
 * login session. Verification failures surface the service's error
 * message verbatim so the user can tell an expired challenge apart from
 * an unknown credential.
 */
export async function signInWithPasskey(
  db: NodePgDatabase,
  session: BlogSession,
  clientAddress: string,
  request: Request,
  formData: FormData,
  redirectTo: string,
): Promise<AuthFlowResult> {
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
    await updateLastLogin(db, BigInt(result.user.id), clientAddress, request.headers.get('User-Agent'))
    recordAuditEvent({
      action: 'login',
      resourceType: 'session',
      resourceId: session.id,
      actorId: BigInt(result.user.id),
      actorRole: result.user.role,
      ipAddress: clientAddress,
      userAgent: request.headers.get('User-Agent'),
      details: { method: 'passkey' },
    })
    return { type: 'redirect', to: redirectTo, setCookie: established.setCookie }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Passkey 验证失败，请重试。'
    return { type: 'error', message }
  }
}
