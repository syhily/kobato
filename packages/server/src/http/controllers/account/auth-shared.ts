import type { AuthFlowOutput } from '@kobato/api/contracts/account/auth'
import type { AuthFlowResult, SigninFlowContext } from '@kobato/server/domains/auth/services/shared'
import type { HandlerContext } from '@kobato/server/http/orpc-base'

import { AUTH_ACTION_REDIRECT_FALLBACK } from '@kobato/api/contracts/account/auth'
import { safeRedirectPath } from '@kobato/base/utils/safe-url'

export function authFlowContext(context: HandlerContext): SigninFlowContext {
  return {
    db: context.db,
    session: context.session,
    clientAddress: context.clientAddress,
    markSessionDirty: () => context.markSessionDirty(),
  }
}

export function wireAuthFlow(result: AuthFlowResult, context: HandlerContext): AuthFlowOutput {
  if (result.setCookie !== undefined) {
    context.responseHeaders.append('Set-Cookie', result.setCookie)
  }
  switch (result.type) {
    case 'redirect':
      return { type: 'redirect', to: result.to }
    case 'error':
      return {
        type: 'error',
        message: result.message,
        ...(result.descriptor === undefined ? {} : { descriptor: result.descriptor }),
      }
    case 'success':
      return {
        type: 'success',
        message: result.message,
        ...(result.descriptor === undefined ? {} : { descriptor: result.descriptor }),
      }
  }
}

export function safeActionRedirect(raw: string | null | undefined, context: HandlerContext): string {
  return safeRedirectPath(raw ?? null, AUTH_ACTION_REDIRECT_FALLBACK, context.request.url)
}

export function authFlowFormData(entries: Record<string, string>): FormData {
  const formData = new FormData()
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value)
  }
  return formData
}
