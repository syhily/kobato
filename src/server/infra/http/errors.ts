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

const DEFAULT_MESSAGES: Record<DomainErrorCode, string> = {
  BAD_REQUEST: '请求参数无效。',
  UNAUTHORIZED: '需要登录后再操作。',
  FORBIDDEN: '禁止访问。',
  NOT_FOUND: '资源不存在。',
  CONFLICT: '操作与当前状态冲突。',
  RATE_LIMITED: '请求过于频繁，请稍后再试。',
  INTERNAL: '服务器内部错误。',
}

export class DomainError extends Error {
  readonly code: DomainErrorCode
  readonly issues?: { message: string; path?: string[] }[]
  /**
   * Queue-worker hint: transient, retryable on a backoff waterline; absent
   * means terminal. HTTP mapping never reads it.
   */
  readonly retryable?: boolean

  constructor(
    code: DomainErrorCode,
    message?: string,
    issues?: { message: string; path?: string[] }[],
    retryable?: boolean,
  ) {
    super(message ?? DEFAULT_MESSAGES[code])
    this.code = code
    this.issues = issues
    this.retryable = retryable
    this.name = 'DomainError'
  }
}

/**
 * `DomainError` flattened for the worker_threads structured-clone boundary;
 * the main thread rehydrates it via `domainErrorFromWire`.
 */
export interface DomainErrorWire {
  name: string
  code?: string
  message: string
  issues?: { message: string; path?: string[] }[]
}

/**
 * Rehydrate a wire error into a `DomainError`, else `null` when it is not
 * one; the caller owns the fallback for non-domain errors.
 */
export function domainErrorFromWire(error: DomainErrorWire): DomainError | null {
  if (error.name === 'DomainError' && error.code !== undefined && isDomainErrorCode(error.code)) {
    return new DomainError(error.code, error.message, error.issues)
  }
  return null
}

function isDomainErrorCode(code: string): code is DomainErrorCode {
  return (DOMAIN_ERROR_CODES as readonly string[]).includes(code)
}

export class ActionFailure extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues?: { message: string; path?: string[] }[],
    readonly headers?: HeadersInit,
  ) {
    super(message)
    this.name = 'ActionFailure'
  }
}

export const ErrorMessages = {
  FORBIDDEN: '权限不足，需要更高角色。',
  NOT_FOUND: '资源不存在。',
  UNAUTHORIZED: '需要登录后再操作。',
  INSUFFICIENT_PERMISSIONS: '权限不足',
  INVALID_INPUT: '输入数据无效',
  INTERNAL_SERVER_ERROR: '服务器内部错误',
} as const

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
