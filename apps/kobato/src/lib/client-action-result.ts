import type { AuthFlowOutput } from '@kobato/api/contracts/account/auth'
import type { ErrorMessageDescriptor, ErrorMessageParams } from '@kobato/api/contracts/primitives'
import type { AppLocale } from '@kobato/i18n/locales'
import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'

import { isRecord } from '@kobato/base/utils/type-guards'
import { formatUiMessage, type UiMessageTable } from '@kobato/i18n/format-message'
import { ORPCError } from '@orpc/client'
import { data, redirect } from 'react-router'

const CSRF_FAILED_KEY = 'error.api.csrfFailed'

export interface ClientI18nCatalog {
  locale: AppLocale
  messages: UiMessageTable
}

function flowCopy(
  result: { message: string; descriptor?: ErrorMessageDescriptor },
  catalog: ClientI18nCatalog,
): string {
  const descriptor = result.descriptor
  if (descriptor === undefined) {
    return result.message
  }
  return formatUiMessage(catalog.locale, catalog.messages, descriptor.messageKey, descriptor.params)
}

export function authErrorPayload(
  message: string,
  descriptor: ErrorMessageDescriptor | undefined,
  catalog: ClientI18nCatalog,
): { error: string; errorDescriptor?: ErrorMessageDescriptor } {
  return {
    error: flowCopy({ message, descriptor }, catalog),
    ...(descriptor === undefined ? {} : { errorDescriptor: descriptor }),
  }
}

export function authMessagePayload(
  message: string,
  descriptor: ErrorMessageDescriptor | undefined,
  catalog: ClientI18nCatalog,
): { message: string; messageDescriptor?: ErrorMessageDescriptor } {
  return {
    message: flowCopy({ message, descriptor }, catalog),
    ...(descriptor === undefined ? {} : { messageDescriptor: descriptor }),
  }
}

export function clientAuthFlowError(
  messageKey: UiMessageId,
  params?: ErrorMessageParams,
): Extract<AuthFlowOutput, { type: 'error' }> {
  return {
    type: 'error',
    message: messageKey,
    descriptor: {
      messageKey,
      fallbackMessage: messageKey,
      ...(params === undefined ? {} : { params }),
    },
  }
}

export function isCsrfFailure(error: unknown): boolean {
  if (!(error instanceof ORPCError) || error.code !== 'FORBIDDEN') {
    return false
  }
  const data: unknown = error.data
  if (!isRecord(data) || !isRecord(data.descriptor)) {
    return false
  }
  return data.descriptor.messageKey === CSRF_FAILED_KEY
}

export function toClientActionResult(
  result: AuthFlowOutput,
  catalog: ClientI18nCatalog,
  extraData?: Record<string, unknown>,
) {
  switch (result.type) {
    case 'redirect':
      return redirect(result.to)
    case 'error':
      return data({
        error: flowCopy(result, catalog),
        ...(result.descriptor === undefined ? {} : { errorDescriptor: result.descriptor }),
        ...extraData,
      })
    case 'success':
      return data({
        message: flowCopy(result, catalog),
        ...(result.descriptor === undefined ? {} : { messageDescriptor: result.descriptor }),
        ...extraData,
      })
  }
}
