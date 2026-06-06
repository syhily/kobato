// Domain error codes

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

  constructor(code: DomainErrorCode, message?: string, issues?: { message: string; path?: string[] }[]) {
    super(message ?? DEFAULT_MESSAGES[code])
    this.code = code
    this.issues = issues
    this.name = 'DomainError'
  }
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

/** Detect a Postgres unique-constraint violation (SQLSTATE 23505). */
/** When `constraintName` is passed, the match is narrowed to that specific constraint. */
import { DatabaseError } from 'pg'

export function isUniqueConstraintError(err: unknown, constraintName?: string): boolean {
  if (err instanceof DatabaseError && err.code === '23505') {
    if (constraintName) {
      return err.constraint === constraintName
    }
    return true
  }
  return false
}
