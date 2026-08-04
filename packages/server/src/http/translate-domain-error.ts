import { ActionFailure, DomainError, domainStatus } from '@kobato/server/infra/http/errors'

/**
 * Transport-neutral projection of a domain-layer failure. Both HTTP
 * adapters — the Hono `onErrorHandler` (`errors.ts`) and the oRPC
 * `domainErrorGuard` (`orpc-base.ts`) — consume this single translation
 * so status, message, issues, and headers can never diverge between
 * transports again. Each adapter applies the result in its own idiom
 * (JSON `Response` headers vs `ORPCError` data + `responseHeaders`).
 */
export interface TranslatedDomainError {
  status: number
  message: string
  issues?: { message: string; path?: string[] }[]
  headers?: HeadersInit
}

export function translateDomainError(error: DomainError | ActionFailure): TranslatedDomainError {
  if (error instanceof ActionFailure) {
    return { status: error.status, message: error.message, issues: error.issues, headers: error.headers }
  }
  return { status: domainStatus(error), message: error.message, issues: error.issues }
}
