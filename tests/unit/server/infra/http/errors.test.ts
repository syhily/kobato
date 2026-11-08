import { describe, expect, it } from 'vitest'

import {
  ActionFailure,
  DOMAIN_ERROR_CODES,
  DomainError,
  domainErrorFromWire,
  domainStatus,
  ErrorMessages,
  isUniqueConstraintError,
  type DomainErrorIssue,
  type DomainErrorWire,
} from '@/server/infra/http/errors'
import { uiMessagesEnUS } from '@/shared/i18n/messages/ui/en-US'

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
  it('uses the English default descriptor when none is provided', () => {
    const err = new DomainError('NOT_FOUND')
    expect(err.message).toBe('Resource not found.')
    expect(err.descriptor).toEqual({ messageKey: 'error.api.notFound', fallbackMessage: 'Resource not found.' })
  })

  it('uses the custom legacy message and carries no descriptor', () => {
    const err = new DomainError('NOT_FOUND', 'gone')
    expect(err.message).toBe('gone')
    expect(err.descriptor).toBeUndefined()
  })

  it('takes a descriptor as the message, keeping the English fallback for logs', () => {
    const descriptor = {
      messageKey: 'admin.settings.errors.invalid',
      fallbackMessage: 'The settings data is invalid',
    } as const
    const err = new DomainError('BAD_REQUEST', descriptor)
    expect(err.message).toBe('The settings data is invalid')
    expect(err.descriptor).toBe(descriptor)
  })

  it('carries raw and descriptor issues alike', () => {
    const issues: DomainErrorIssue[] = [
      { message: 'invalid', path: ['a'] },
      {
        messageKey: 'error.api.rawMessage',
        params: { message: 'structured' },
        fallbackMessage: 'structured',
        path: ['b'],
      },
    ]
    const err = new DomainError('BAD_REQUEST', undefined, issues)
    expect(err.issues).toEqual(issues)
  })

  it('exposes DomainError as the name', () => {
    expect(new DomainError('INTERNAL').name).toBe('DomainError')
  })
})

describe('server/infra/http/errors — DomainErrorWire', () => {
  it('rehydrates a structured-cloned descriptor error (worker boundary)', () => {
    const source = new DomainError(
      'BAD_REQUEST',
      { messageKey: 'admin.settings.errors.invalid', fallbackMessage: 'The settings data is invalid' },
      [
        {
          messageKey: 'admin.settings.rateLimit.error.windowMin',
          params: { min: 60 },
          fallbackMessage: 'The time window must be at least 60 seconds',
          code: 'too_small',
          path: ['signIn', 'windowSeconds'],
        },
      ],
      true,
    )
    const wire = structuredClone<DomainErrorWire>({
      name: source.name,
      code: source.code,
      message: source.message,
      descriptor: source.descriptor,
      issues: source.issues,
    })

    const revived = domainErrorFromWire(wire)
    expect(revived).toBeInstanceOf(DomainError)
    expect(revived?.message).toBe('The settings data is invalid')
    expect(revived?.descriptor).toEqual(source.descriptor)
    expect(revived?.issues).toEqual(source.issues)
  })

  it('rehydrates a legacy raw-message error and ignores non-domain wires', () => {
    const revived = domainErrorFromWire({ name: 'DomainError', code: 'NOT_FOUND', message: '资源不存在。' })
    expect(revived?.message).toBe('资源不存在。')
    expect(revived?.descriptor).toBeUndefined()

    expect(domainErrorFromWire({ name: 'TypeError', message: 'boom' })).toBeNull()
    expect(domainErrorFromWire({ name: 'DomainError', code: 'NOPE', message: 'boom' })).toBeNull()
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
  it('pins every generic descriptor to the English baseline catalog', () => {
    for (const descriptor of Object.values(ErrorMessages)) {
      expect(descriptor.messageKey).toBeTruthy()
      expect(descriptor.fallbackMessage).toBe(uiMessagesEnUS[descriptor.messageKey])
      expect(descriptor.fallbackMessage).not.toBe('')
    }
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
