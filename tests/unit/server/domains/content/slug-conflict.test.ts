import { DatabaseError } from 'pg'
import { describe, expect, it } from 'vitest'

import { rethrowSlugConflict } from '@/server/domains/content/slug-conflict'
import { DomainError } from '@/server/infra/http/errors'

function uniqueViolation(constraint: string): DatabaseError {
  return Object.assign(new DatabaseError('duplicate key value violates unique constraint', 0, 'error'), {
    code: '23505',
    constraint,
  })
}

function catchThrown(fn: () => never): unknown {
  try {
    fn()
  } catch (err) {
    return err
  }
  throw new Error('expected the call to throw')
}

describe('rethrowSlugConflict', () => {
  it.each([
    { entityType: 'post' as const, constraint: 'post_slug_key' },
    { entityType: 'page' as const, constraint: 'page_slug_key' },
  ])('maps the $constraint violation to CONFLICT', ({ entityType, constraint }) => {
    const thrown = catchThrown(() => rethrowSlugConflict(uniqueViolation(constraint), entityType, 'hello'))

    expect(thrown).toBeInstanceOf(DomainError)
    expect((thrown as DomainError).code).toBe('CONFLICT')
    expect((thrown as DomainError).message).toBe('slug "hello" 已被占用。')
  })

  it.each([{ entityType: 'post' as const }, { entityType: 'page' as const }])(
    'maps the slug-registry constraint to CONFLICT ($entityType)',
    ({ entityType }) => {
      const thrown = catchThrown(() =>
        rethrowSlugConflict(uniqueViolation('uq_slug_registry_slug'), entityType, 'hello'),
      )

      expect(thrown).toBeInstanceOf(DomainError)
      expect((thrown as DomainError).code).toBe('CONFLICT')
      expect((thrown as DomainError).message).toBe('slug "hello" 已被占用。')
    },
  )

  it('maps a driver error wrapped in a DrizzleQueryError cause to CONFLICT', () => {
    const wrapped = Object.assign(new Error('Failed query'), { cause: uniqueViolation('page_slug_key') })

    const thrown = catchThrown(() => rethrowSlugConflict(wrapped, 'page', 'hello'))

    expect(thrown).toBeInstanceOf(DomainError)
    expect((thrown as DomainError).code).toBe('CONFLICT')
    expect((thrown as DomainError).message).toBe('slug "hello" 已被占用。')
  })

  it('rethrows a unique violation from a different constraint unchanged', () => {
    const original = uniqueViolation('some_other_constraint')

    expect(catchThrown(() => rethrowSlugConflict(original, 'post', 'hello'))).toBe(original)
  })

  it('rethrows the outer error when a wrapped violation belongs to another constraint', () => {
    const wrapped = Object.assign(new Error('Failed query'), { cause: uniqueViolation('some_other_constraint') })

    expect(catchThrown(() => rethrowSlugConflict(wrapped, 'page', 'hello'))).toBe(wrapped)
  })

  it('rethrows a non-23505 error unchanged', () => {
    const original = new Error('connection lost')

    expect(catchThrown(() => rethrowSlugConflict(original, 'page', 'hello'))).toBe(original)
  })
})
