// The transport-level error contract shared by the Hono JSON handler, the
// oRPC error `data` channel and the client's API-error helpers.
//
// The server translates; the client displays. A producer states WHAT failed as
// a typed message id plus its params, and keeps an English `fallbackMessage`
// for logs, old clients and diagnostics. The Hono/oRPC boundaries resolve the
// descriptor against `context.localization.locale`; each wire issue carries
// BOTH the resolved `message` for display and the structured descriptor so a
// consumer can still map issues back to fields / re-localize on its own.

import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

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
   * The issue's complete user-readable text in the REQUEST locale. A consumer
   * that only reads `message` (the pre-descriptor shape) shows this verbatim;
   * the key itself never rides this field. The descriptor fields stay for
   * consumers that localize themselves or map issues back to fields.
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
