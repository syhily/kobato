import { ActionFailure, DomainError, domainStatus } from '@/server/infra/http/errors'

/** Single translation shared by the Hono and oRPC adapters so status,
 *  message, issues, and headers can never diverge between transports. */
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
