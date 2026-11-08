import type { ServerTranslator } from '@/server/infra/i18n'
import type { ApiErrorData, ErrorIssueWire, ErrorMessageDescriptor } from '@/shared/contracts/api-error'

import { descriptorMessage, rawMessageDescriptor } from '@/server/infra/http/error-descriptor'
import { ActionFailure, DomainError, domainStatus, type DomainErrorIssue } from '@/server/infra/http/errors'

/** Single translation shared by the Hono and oRPC adapters so status, code,
 *  message, descriptor, issues, and headers can never diverge between transports. */
export interface TranslatedDomainError {
  status: number
  /** Transport code: a `DomainError` code, or the generic fallback. */
  code: string
  /** Localized top-level message (legacy raw text when the error predates descriptors). */
  message: string
  descriptor: ErrorMessageDescriptor
  issues?: ErrorIssueWire[]
  headers?: HeadersInit
}

/** A transport-neutral error the adapters normalize into {@link TranslatedDomainError}. */
export interface ApiErrorInput {
  status: number
  code: string
  /** Descriptor, or legacy raw text this boundary wraps in the passthrough key. */
  message: string | ErrorMessageDescriptor
  issues?: DomainErrorIssue[]
  headers?: HeadersInit
}

function issueToWire(issue: DomainErrorIssue, translator?: ServerTranslator): ErrorIssueWire {
  const descriptor: ErrorMessageDescriptor = 'messageKey' in issue ? issue : rawMessageDescriptor(issue.message)
  return {
    messageKey: descriptor.messageKey,
    ...(descriptor.params === undefined ? {} : { params: descriptor.params }),
    fallbackMessage: descriptor.fallbackMessage,
    message: descriptorMessage(descriptor, translator),
    ...(issue.code === undefined ? {} : { code: issue.code }),
    ...(issue.path === undefined ? {} : { path: issue.path }),
  }
}

/**
 * Resolve an error's user-facing copy for one request. A descriptor is
 * formatted against the request's server translator; a legacy raw message
 * rides its passthrough descriptor unchanged. Without a translator (unit
 * callers, diagnostics) the English fallback is the honest answer.
 */
export function translateApiError(input: ApiErrorInput, translator?: ServerTranslator): TranslatedDomainError {
  const descriptor = typeof input.message === 'string' ? rawMessageDescriptor(input.message) : input.message
  const message = descriptorMessage(descriptor, translator)
  const issues = input.issues?.map((issue) => issueToWire(issue, translator))
  return {
    status: input.status,
    code: input.code,
    message,
    descriptor,
    ...(issues === undefined ? {} : { issues }),
    ...(input.headers === undefined ? {} : { headers: input.headers }),
  }
}

/** `DomainError`/`ActionFailure` → the shared translation. */
export function translateDomainError(
  error: DomainError | ActionFailure,
  translator?: ServerTranslator,
): TranslatedDomainError {
  return translateApiError(
    {
      status: error instanceof ActionFailure ? error.status : domainStatus(error),
      code: error instanceof DomainError ? error.code : 'INTERNAL_SERVER_ERROR',
      message: error.descriptor ?? error.message,
      issues: error.issues,
      headers: error instanceof ActionFailure ? error.headers : undefined,
    },
    translator,
  )
}

/**
 * Fold the localized issue list into the user-facing message, so an
 * `ORPCError.message` names the failing field without a second client-side
 * translation. Joins/separators are catalog messages, never hardcoded
 * punctuation: English `; ` and full-width `；` differ by locale.
 */
export function summarizeApiError(translated: TranslatedDomainError, translator: ServerTranslator): string {
  const { issues } = translated
  if (issues === undefined || issues.length === 0) {
    return translated.message
  }
  const separator = translator.format('error.api.issueSeparator')
  const parts = issues.map((issue) => {
    // The wire already resolved the issue text for this request locale.
    const text = issue.message
    const path = issue.path?.join('.')
    return path === undefined || path === ''
      ? text
      : translator.format('error.api.issueWithPath', { path, message: text })
  })
  return translator.format('error.api.summary', { message: translated.message, issues: parts.join(separator) })
}

/**
 * Join non-fatal descriptors into the wire `warning` string (space-separated,
 * the pre-descriptor shape the revision contract keeps).
 */
export function formatWarningDescriptors(
  descriptors: readonly ErrorMessageDescriptor[],
  translator: ServerTranslator,
): string | undefined {
  if (descriptors.length === 0) {
    return undefined
  }
  return descriptors.map((descriptor) => translator.format(descriptor.messageKey, descriptor.params)).join(' ')
}

/** The wire payload the adapters attach (`ORPCError.data`, Hono's `error` body). */
export function apiErrorData(translated: TranslatedDomainError): ApiErrorData {
  return {
    descriptor: translated.descriptor,
    ...(translated.issues === undefined ? {} : { issues: translated.issues }),
  }
}

/** HTTP status → a stable transport code for errors Hono raises itself. */
export function codeForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST'
    case 401:
      return 'UNAUTHORIZED'
    case 403:
      return 'FORBIDDEN'
    case 404:
      return 'NOT_FOUND'
    case 409:
      return 'CONFLICT'
    case 413:
      return 'PAYLOAD_TOO_LARGE'
    case 422:
      return 'UNPROCESSABLE_CONTENT'
    case 429:
      return 'TOO_MANY_REQUESTS'
    default:
      return status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST'
  }
}
