import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'

export type ErrorMessageParams = Record<string, string | number | boolean | null>

export interface ErrorMessageDescriptor {
  /** Catalog id (UI catalog: the same corpus the client renders). */
  messageKey: UiMessageId
  params?: ErrorMessageParams
  /** English text for logs, old clients and diagnostics. */
  fallbackMessage: string
}

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
