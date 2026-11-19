import type { ErrorMessageDescriptor, ErrorMessageParams } from '@kobato/contracts/api-error.ts'
import type { Database } from '@kobato/db/database.ts'
import type { AppLocale } from '@kobato/i18n/locales.ts'
import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US.ts'
import type { BlogSession } from '@kobato/server/domains/auth/session-storage.ts'
import type { z } from 'zod'

import { zodIssueParams } from '@kobato/contracts/api-error.ts'
import { checkMailReady } from '@kobato/server/infra/email/sender.ts'
import { descriptorFor, isUiMessageId, messageDescriptor } from '@kobato/server/infra/http/error-descriptor.ts'
import { createServerTranslator } from '@kobato/server/infra/i18n.ts'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters.ts'

export type AuthFlowError = Extract<AuthFlowResult, { type: 'error' }>
export type AuthFlowSuccess = Extract<AuthFlowResult, { type: 'success' }>

export type AuthFlowResult =
  | { type: 'redirect'; to: string; setCookie?: string }
  | { type: 'error'; message: string; descriptor?: ErrorMessageDescriptor; setCookie?: string }
  | { type: 'success'; message: string; descriptor?: ErrorMessageDescriptor; setCookie?: string }

export function authFlowMessage(
  message: string,
  descriptor: ErrorMessageDescriptor | undefined,
  locale: AppLocale,
): string {
  if (descriptor === undefined) {
    return message
  }
  return createServerTranslator(locale).format(descriptor.messageKey, descriptor.params)
}

export function authFlowError(messageKey: UiMessageId, params?: ErrorMessageParams): AuthFlowError {
  const descriptor = descriptorFor(messageKey, params)
  return { type: 'error', message: descriptor.fallbackMessage, descriptor }
}

export function authFlowValidationError(fallbackKey: UiMessageId, issues: readonly z.core.$ZodIssue[]): AuthFlowError {
  const typed = issues.find((issue) => isUiMessageId(issue.message))
  if (typed === undefined) {
    return authFlowError(fallbackKey)
  }
  const descriptor = messageDescriptor(typed.message, zodIssueParams(typed))
  return { type: 'error', message: descriptor.fallbackMessage, descriptor }
}

export function authFlowSuccess(messageKey: UiMessageId, params?: ErrorMessageParams): AuthFlowSuccess {
  const descriptor = descriptorFor(messageKey, params)
  return { type: 'success', message: descriptor.fallbackMessage, descriptor }
}

export interface SigninFlowContext {
  db: Database
  session: BlogSession
  clientAddress: string
  markSessionDirty(): void
}

export function formFieldString(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

export function isMailLoginReady(): boolean {
  const mail = getBlogSettingsBundleSync()?.mail?.mail
  return mail !== undefined && checkMailReady(mail).ready
}
