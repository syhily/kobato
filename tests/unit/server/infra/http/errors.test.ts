import { describe, expect, it } from 'vitest'

import {
  ActionFailure,
  DOMAIN_ERROR_CODES,
  DomainError,
  domainStatus,
  ErrorMessages,
  isUniqueConstraintError,
} from '@/server/infra/http/errors'

describe('server/infra/http/errors — DOMAIN_ERROR_CODES', () => {
  it('exposes the closed list of error codes', () => {
    expect(DOMAIN_ERROR_CODES).toContain('BAD_REQUEST')
    expect(DOMAIN_ERROR_CODES).toContain('RATE_LIMITED')
    expect(DOMAIN_ERROR_CODES).toContain('INTERNAL')
  })
})

describe('server/infra/http/errors — domainStatus', () => {
  it('maps each code to its HTTP status', () => {
    expect(domainStatus(new DomainError('BAD_REQUEST'))).toBe(400)
    expect(domainStatus(new DomainError('UNAUTHORIZED'))).toBe(401)
    expect(domainStatus(new DomainError('FORBIDDEN'))).toBe(403)
    expect(domainStatus(new DomainError('NOT_FOUND'))).toBe(404)
    expect(domainStatus(new DomainError('CONFLICT'))).toBe(409)
    expect(domainStatus(new DomainError('RATE_LIMITED'))).toBe(429)
    expect(domainStatus(new DomainError('INTERNAL'))).toBe(500)
  })
})

describe('server/infra/http/errors — DomainError', () => {
  it('uses the default message when none is provided', () => {
    expect(new DomainError('NOT_FOUND').message).toBe('资源不存在。')
  })

  it('uses the custom message when provided', () => {
    expect(new DomainError('NOT_FOUND', 'gone').message).toBe('gone')
  })

  it('carries the issues array', () => {
    const err = new DomainError('BAD_REQUEST', undefined, [{ message: 'invalid', path: ['a'] }])
    expect(err.issues).toEqual([{ message: 'invalid', path: ['a'] }])
  })

  it('exposes DomainError as the name', () => {
    expect(new DomainError('INTERNAL').name).toBe('DomainError')
  })
})

describe('server/infra/http/errors — ActionFailure', () => {
  it('stores status, message, issues and headers', () => {
    const err = new ActionFailure(409, 'conflict', [{ message: 'dup' }], { 'X-Foo': 'bar' })
    expect(err.status).toBe(409)
    expect(err.message).toBe('conflict')
    expect(err.issues).toEqual([{ message: 'dup' }])
    expect(err.headers).toEqual({ 'X-Foo': 'bar' })
    expect(err.name).toBe('ActionFailure')
  })
})

describe('server/infra/http/errors — ErrorMessages', () => {
  it('contains the canonical forbidden/not-found/unauthorized strings', () => {
    expect(ErrorMessages.FORBIDDEN).toBeTruthy()
    expect(ErrorMessages.NOT_FOUND).toBeTruthy()
    expect(ErrorMessages.UNAUTHORIZED).toBeTruthy()
    expect(ErrorMessages.INVALID_INPUT).toBeTruthy()
    expect(ErrorMessages.INTERNAL_SERVER_ERROR).toBeTruthy()
  })
})

describe('server/infra/http/errors — isUniqueConstraintError', () => {
  function buildSqliteError(errcode: number, message: string): Error {
    const err = new Error(message)
    Object.assign(err, { errcode })
    return err
  }

  const SQLITE_UNIQUE = 2067
  const SQLITE_FK = 787

  it('returns true for any SQLITE_CONSTRAINT_UNIQUE error when no constraint is provided', () => {
    expect(isUniqueConstraintError(buildSqliteError(SQLITE_UNIQUE, 'UNIQUE constraint failed: user.email'))).toBe(true)
  })

  it('narrows to a specific constraint name when provided', () => {
    const err = buildSqliteError(SQLITE_UNIQUE, 'UNIQUE constraint failed: user.email')
    expect(isUniqueConstraintError(err, 'user.email')).toBe(true)
    expect(isUniqueConstraintError(err, 'post.slug')).toBe(false)
  })

  it('returns false for non-driver errors', () => {
    expect(isUniqueConstraintError(new Error('boom'))).toBe(false)
  })

  it('returns false for driver errors with a different errcode', () => {
    expect(isUniqueConstraintError(buildSqliteError(SQLITE_FK, 'FOREIGN KEY constraint failed'))).toBe(false)
  })

  it('matches a driver error wrapped one level deep (DrizzleQueryError cause)', () => {
    const wrapped = Object.assign(new Error('Failed query'), {
      cause: buildSqliteError(SQLITE_UNIQUE, 'UNIQUE constraint failed: user.email'),
    })
    expect(isUniqueConstraintError(wrapped)).toBe(true)
  })

  it('narrows a wrapped driver error to a specific constraint name', () => {
    const wrapped = Object.assign(new Error('Failed query'), {
      cause: buildSqliteError(SQLITE_UNIQUE, 'UNIQUE constraint failed: user.email'),
    })
    expect(isUniqueConstraintError(wrapped, 'user.email')).toBe(true)
  })

  it('returns false when the wrapped violation belongs to another constraint', () => {
    const wrapped = Object.assign(new Error('Failed query'), {
      cause: buildSqliteError(SQLITE_UNIQUE, 'UNIQUE constraint failed: post.slug'),
    })
    expect(isUniqueConstraintError(wrapped, 'user.email')).toBe(false)
  })

  it('returns false for a wrapped driver error with a different errcode', () => {
    const wrapped = Object.assign(new Error('Failed query'), {
      cause: buildSqliteError(SQLITE_FK, 'FOREIGN KEY constraint failed'),
    })
    expect(isUniqueConstraintError(wrapped)).toBe(false)
  })
})
