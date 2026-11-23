import type { AuthFlowOutput } from '@kobato/api/contracts/account/auth'
import type { ErrorMessageDescriptor } from '@kobato/api/contracts/primitives'
import type { AppLocale } from '@kobato/i18n/locales'

import { authFlowMessage } from '@kobato/server/domains/auth/services/shared'
import { data, redirect } from 'react-router'

export function authErrorPayload(
  message: string,
  descriptor: ErrorMessageDescriptor | undefined,
  locale: AppLocale,
): { error: string; errorDescriptor?: ErrorMessageDescriptor } {
  return {
    error: authFlowMessage(message, descriptor, locale),
    ...(descriptor === undefined ? {} : { errorDescriptor: descriptor }),
  }
}

export function authMessagePayload(
  message: string,
  descriptor: ErrorMessageDescriptor | undefined,
  locale: AppLocale,
): { message: string; messageDescriptor?: ErrorMessageDescriptor } {
  return {
    message: authFlowMessage(message, descriptor, locale),
    ...(descriptor === undefined ? {} : { messageDescriptor: descriptor }),
  }
}

export function cookieHeaders(responseHeaders: Headers): Headers {
  const headers = new Headers()
  for (const setCookie of responseHeaders.getSetCookie()) {
    headers.append('Set-Cookie', setCookie)
  }
  return headers
}

export function toActionResult(
  result: AuthFlowOutput,
  locale: AppLocale,
  responseHeaders: Headers,
  extraData?: Record<string, unknown>,
) {
  const headers = cookieHeaders(responseHeaders)
  switch (result.type) {
    case 'redirect':
      return redirect(result.to, { headers })
    case 'error':
      return data({ ...authErrorPayload(result.message, result.descriptor, locale), ...extraData }, { headers })
    case 'success':
      return data({ ...authMessagePayload(result.message, result.descriptor, locale), ...extraData }, { headers })
  }
}

export function formField(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value : ''
}

export function formOptionalField(formData: FormData, key: string): string | undefined {
  const value = formData.get(key)
  return typeof value === 'string' ? value : undefined
}
