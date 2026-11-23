import { isUniqueConstraintError } from '@kobato/db/sqlite/errors'
import { describe, expect, it } from 'vitest'

describe('db/errors — isUniqueConstraintError', () => {
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
