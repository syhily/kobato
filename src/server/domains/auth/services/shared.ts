// Shared contract of the sign-in services; per-flow modules own the auth session-key state machine.

import type { z } from 'zod'

import type { BlogSession } from '@/server/domains/auth/session-storage'
import type { Database } from '@/server/infra/db/database'
import type { ErrorMessageDescriptor, ErrorMessageParams } from '@/shared/contracts/api-error'
import type { AppLocale } from '@/shared/i18n/locales'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { checkMailReady } from '@/server/infra/email/sender'
import { descriptorFor, isUiMessageId, messageDescriptor } from '@/server/infra/http/error-descriptor'
import { createServerTranslator } from '@/server/infra/i18n'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { zodIssueParams } from '@/shared/utils/zod-issue-bounds'

/** A flow error whose copy the sign-in route translates for the request locale. */
export type AuthFlowError = Extract<AuthFlowResult, { type: 'error' }>
/** A flow success notice (same descriptor discipline as errors). */
export type AuthFlowSuccess = Extract<AuthFlowResult, { type: 'success' }>

/**
 * A flow outcome's copy: `message` is the log/technical fallback, `descriptor`
 * (when present) is the typed user-facing message translated for the request locale.
 */
export type AuthFlowResult =
  | { type: 'redirect'; to: string; setCookie?: string }
  | { type: 'error'; message: string; descriptor?: ErrorMessageDescriptor; setCookie?: string }
  | { type: 'success'; message: string; descriptor?: ErrorMessageDescriptor; setCookie?: string }

/**
 * The route-facing resolution (server translates, client displays): descriptor → the
 * locale's sentence, raw message → unchanged. Lives in the auth domain so `routes/auth`
 * stays on its import whitelist.
 */
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

/** Descriptor-backed error outcome; `message` keeps the English fallback for logs. */
export function authFlowError(messageKey: UiMessageId, params?: ErrorMessageParams): AuthFlowError {
  const descriptor = descriptorFor(messageKey, params)
  return { type: 'error', message: descriptor.fallbackMessage, descriptor }
}

/**
 * Schema-parse failure → flow error: the first issue carrying a typed catalog id
 * (the custom rule messages in `domains/auth/schema.ts`) wins so the user sees the
 * actual condition; standard Zod prose keeps the caller's generic key.
 */
export function authFlowValidationError(fallbackKey: UiMessageId, issues: readonly z.core.$ZodIssue[]): AuthFlowError {
  const typed = issues.find((issue) => isUiMessageId(issue.message))
  if (typed === undefined) {
    return authFlowError(fallbackKey)
  }
  const descriptor = messageDescriptor(typed.message, zodIssueParams(typed))
  return { type: 'error', message: descriptor.fallbackMessage, descriptor }
}

/** Descriptor-backed success outcome (enumeration-safe notices). */
export function authFlowSuccess(messageKey: UiMessageId, params?: ErrorMessageParams): AuthFlowSuccess {
  const descriptor = descriptorFor(messageKey, params)
  return { type: 'success', message: descriptor.fallbackMessage, descriptor }
}

/**
 * The slice of the canonical request context the signin flows need. Same-session
 * mutations call `markSessionDirty()`; `AuthFlowResult.setCookie` is reserved for
 * sid-rotating results, never for same-session commits.
 */
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

/**
 * Whether mail-dependent signin steps (post-password OTP, magic-link
 * delivery) can run right now.
 */
export function isMailLoginReady(): boolean {
  const mail = getBlogSettingsBundleSync()?.mail?.mail
  return mail !== undefined && checkMailReady(mail).ready
}
