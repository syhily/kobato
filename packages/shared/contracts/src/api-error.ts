// Transport-level error contract shared by the Hono JSON handler, the oRPC
// error `data` channel and the client API-error helpers.
//
// The server translates; the client displays. A producer states WHAT failed as
// a typed message id plus params, and keeps an English `fallbackMessage` for
// logs, old clients and diagnostics. The Hono/oRPC boundaries resolve the
// descriptor against `context.localization.locale`; each wire issue carries
// BOTH the resolved `message` and the descriptor so a consumer can map issues
// back to fields or re-localize on its own.

import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US.ts'

/** ICU values a server-side error message may interpolate. */
export type ErrorMessageParams = Record<string, string | number | boolean | null>

export interface ErrorMessageDescriptor {
  /** Catalog id (UI catalog: the same corpus the client renders). */
  messageKey: UiMessageId
  params?: ErrorMessageParams
  /** English text for logs, old clients and diagnostics. */
  fallbackMessage: string
}

/** One validation issue: the descriptor, its localized text and the field it belongs to. */
export interface ErrorIssueWire extends ErrorMessageDescriptor {
  /**
   * The issue's complete user-readable text in the REQUEST locale; the key
   * itself never rides this field. The descriptor fields stay for consumers
   * that localize themselves or map issues back to fields.
   */
  message: string
  /** Producer code (a Zod issue code, or a domain-specific tag). */
  code?: string
  /** Field path, outermost first (`['rateLimit', 'signIn', 'maxAttempts']`). */
  path?: string[]
}

/** The oRPC `ORPCError.data` payload (and the Hono `error` object body). */
export interface ApiErrorData {
  descriptor: ErrorMessageDescriptor
  issues?: ErrorIssueWire[]
}

export type ZodIssueParamValue = string | number | boolean | null

export type ZodIssueParams = Record<string, ZodIssueParamValue>

function isParamValue(value: unknown): value is ZodIssueParamValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function addNumericBounds(issue: object, params: ZodIssueParams): void {
  if ('minimum' in issue && typeof issue.minimum === 'number' && Number.isFinite(issue.minimum)) {
    params.min = issue.minimum
  }
  if ('maximum' in issue && typeof issue.maximum === 'number' && Number.isFinite(issue.maximum)) {
    params.max = issue.maximum
  }
}

export function zodIssueParams(issue: unknown): ZodIssueParams | undefined {
  if (typeof issue !== 'object' || issue === null) {
    return undefined
  }
  const params: ZodIssueParams = {}
  addNumericBounds(issue, params)
  if ('params' in issue && isRecord(issue.params)) {
    for (const [key, value] of Object.entries(issue.params)) {
      if (isParamValue(value)) {
        params[key] = value
      }
    }
  }
  return Object.keys(params).length === 0 ? undefined : params
}
