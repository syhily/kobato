import { DatabaseError } from 'pg'
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
  function buildPgError(code: string, constraint?: string): DatabaseError {
    const err = new DatabaseError('err', 0, 'error')
    Object.assign(err, { code, constraint })
    return err
  }

  it('returns true for any 23505 error when no constraint is provided', () => {
    expect(isUniqueConstraintError(buildPgError('23505'))).toBe(true)
  })

  it('narrows to a specific constraint name when provided', () => {
    expect(isUniqueConstraintError(buildPgError('23505', 'users_email_unique'), 'users_email_unique')).toBe(true)
    expect(isUniqueConstraintError(buildPgError('23505', 'other_unique'), 'users_email_unique')).toBe(false)
  })

  it('returns false for non-pg errors', () => {
    expect(isUniqueConstraintError(new Error('boom'))).toBe(false)
  })

  it('returns false for pg errors with a different SQLSTATE', () => {
    expect(isUniqueConstraintError(buildPgError('23503'))).toBe(false)
  })

  it('matches a driver error wrapped one level deep (DrizzleQueryError cause)', () => {
    const wrapped = Object.assign(new Error('Failed query'), { cause: buildPgError('23505') })
    expect(isUniqueConstraintError(wrapped)).toBe(true)
  })

  it('narrows a wrapped driver error to a specific constraint name', () => {
    const wrapped = Object.assign(new Error('Failed query'), {
      cause: buildPgError('23505', 'users_email_unique'),
    })
    expect(isUniqueConstraintError(wrapped, 'users_email_unique')).toBe(true)
  })

  it('returns false when the wrapped violation belongs to another constraint', () => {
    const wrapped = Object.assign(new Error('Failed query'), { cause: buildPgError('23505', 'other_unique') })
    expect(isUniqueConstraintError(wrapped, 'users_email_unique')).toBe(false)
  })

  it('returns false for a wrapped pg error with a different SQLSTATE', () => {
    const wrapped = Object.assign(new Error('Failed query'), { cause: buildPgError('23503') })
    expect(isUniqueConstraintError(wrapped)).toBe(false)
  })
})
