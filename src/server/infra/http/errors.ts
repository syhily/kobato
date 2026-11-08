import type { ErrorMessageDescriptor } from '@/shared/contracts/api-error'

export const DOMAIN_ERROR_CODES = [
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL',
] as const

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number]

const DOMAIN_STATUS: Record<DomainErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
}

export function domainStatus(error: DomainError): number {
  return DOMAIN_STATUS[error.code]
}

/**
 * One structured issue. A descriptor (transports localize it) or legacy raw
 * text (rendered verbatim until the producing domain migrates); `code`/`path`
 * let API consumers map the issue back to a field.
 */
export type DomainErrorIssue =
  | { message: string; path?: string[]; code?: string }
  | (ErrorMessageDescriptor & { path?: string[]; code?: string })

// Generic fallback descriptors: English text for logs + typed ids for the
// transports. Per-domain errors pass their own descriptor.
const DEFAULT_DESCRIPTORS = {
  BAD_REQUEST: { messageKey: 'error.api.badRequest', fallbackMessage: 'Invalid request parameters.' },
  UNAUTHORIZED: { messageKey: 'error.api.unauthorized', fallbackMessage: 'Sign in to continue.' },
  FORBIDDEN: {
    messageKey: 'error.api.forbidden',
    fallbackMessage: 'Insufficient permissions; a higher role is required.',
  },
  NOT_FOUND: { messageKey: 'error.api.notFound', fallbackMessage: 'Resource not found.' },
  CONFLICT: { messageKey: 'error.api.conflict', fallbackMessage: 'The operation conflicts with the current state.' },
  RATE_LIMITED: { messageKey: 'error.api.rateLimited', fallbackMessage: 'Too many requests. Please try again later.' },
  INTERNAL: { messageKey: 'error.api.internal', fallbackMessage: 'Internal server error' },
} as const satisfies Record<DomainErrorCode, ErrorMessageDescriptor>

/**
 * `message` stays the log/technical fallback: pass a descriptor to state the
 * user-facing copy (translated at the transport boundary), or a raw string for
 * a domain that has not migrated yet (rendered unchanged).
 */
export class DomainError extends Error {
  readonly code: DomainErrorCode
  readonly issues?: DomainErrorIssue[]
  /**
   * Localizable user-facing copy. Absent on legacy raw-message errors, where
   * the transports wrap `message` in the passthrough key instead.
   */
  readonly descriptor?: ErrorMessageDescriptor
  /**
   * Queue-worker hint: transient, retryable on a backoff waterline; absent
   * means terminal. HTTP mapping never reads it.
   */
  readonly retryable?: boolean

  constructor(
    code: DomainErrorCode,
    message?: string | ErrorMessageDescriptor,
    issues?: DomainErrorIssue[],
    retryable?: boolean,
  ) {
    const descriptor = typeof message === 'string' || message === undefined ? undefined : message
    super(
      descriptor?.fallbackMessage ??
        (typeof message === 'string' ? message : DEFAULT_DESCRIPTORS[code].fallbackMessage),
    )
    this.code = code
    this.issues = issues
    this.retryable = retryable
    this.descriptor = descriptor ?? (message === undefined ? DEFAULT_DESCRIPTORS[code] : undefined)
    this.name = 'DomainError'
  }
}

/**
 * `DomainError` flattened for the worker_threads structured-clone boundary;
 * the main thread rehydrates it via `domainErrorFromWire`. Descriptors are
 * plain objects, so they survive the clone unchanged.
 */
export interface DomainErrorWire {
  name: string
  code?: string
  message: string
  descriptor?: ErrorMessageDescriptor
  issues?: DomainErrorIssue[]
}

/**
 * Rehydrate a wire error into a `DomainError`, else `null` when it is not
 * one; the caller owns the fallback for non-domain errors.
 */
export function domainErrorFromWire(error: DomainErrorWire): DomainError | null {
  if (error.name === 'DomainError' && error.code !== undefined && isDomainErrorCode(error.code)) {
    return new DomainError(error.code, error.descriptor ?? error.message, error.issues)
  }
  return null
}

function isDomainErrorCode(code: string): code is DomainErrorCode {
  return (DOMAIN_ERROR_CODES as readonly string[]).includes(code)
}

export class ActionFailure extends Error {
  readonly descriptor?: ErrorMessageDescriptor
  constructor(
    readonly status: number,
    message: string | ErrorMessageDescriptor,
    readonly issues?: DomainErrorIssue[],
    readonly headers?: HeadersInit,
  ) {
    const descriptor = typeof message === 'string' ? undefined : message
    super(typeof message === 'string' ? message : message.fallbackMessage)
    this.descriptor = descriptor
    this.name = 'ActionFailure'
  }
}

/**
 * The generic transport errors (middleware gates, strict-patch/Zod boundaries).
 * Descriptors, not prose: the Hono/oRPC boundaries localize them per request.
 * Per-domain copy belongs in its own module as a typed descriptor.
 */
export const ErrorMessages = {
  FORBIDDEN: {
    messageKey: 'error.api.forbidden',
    fallbackMessage: 'Insufficient permissions; a higher role is required.',
  },
  NOT_FOUND: { messageKey: 'error.api.notFound', fallbackMessage: 'Resource not found.' },
  UNAUTHORIZED: { messageKey: 'error.api.unauthorized', fallbackMessage: 'Sign in to continue.' },
  INSUFFICIENT_PERMISSIONS: {
    messageKey: 'error.api.insufficientPermissions',
    fallbackMessage: 'Insufficient permissions',
  },
  INVALID_INPUT: { messageKey: 'error.api.invalidInput', fallbackMessage: 'Invalid input data' },
  INTERNAL_SERVER_ERROR: { messageKey: 'error.api.internal', fallbackMessage: 'Internal server error' },
} as const satisfies Record<string, ErrorMessageDescriptor>

/**
 * Unique-constraint detection: node:sqlite `errcode` 2067/1555, `constraintName`
 * matched against the message text, `cause` unwrapped one level for drizzle.
 */
const SQLITE_CONSTRAINT_PRIMARYKEY = 1555
const SQLITE_CONSTRAINT_UNIQUE = 2067

function errcodeOf(candidate: unknown): number | undefined {
  if (candidate !== null && typeof candidate === 'object' && 'errcode' in candidate) {
    const code = candidate.errcode
    if (typeof code === 'number') {
      return code
    }
  }
  return undefined
}

export function isUniqueConstraintError(err: unknown, constraintName?: string): boolean {
  const candidates = [err, err instanceof Error ? err.cause : undefined]
  return candidates.some((candidate) => {
    const code = errcodeOf(candidate)
    if (code !== SQLITE_CONSTRAINT_UNIQUE && code !== SQLITE_CONSTRAINT_PRIMARYKEY) {
      return false
    }
    if (constraintName) {
      return candidate instanceof Error && candidate.message.includes(constraintName)
    }
    return true
  })
}
