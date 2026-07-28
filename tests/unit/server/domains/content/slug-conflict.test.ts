import { describe, expect, it } from 'vitest'

import { rethrowSlugConflict } from '@/server/domains/content/slug-conflict'
import { DomainError } from '@/server/infra/http/errors'

function uniqueViolation(failed: string): Error {
  // node:sqlite unique violations carry errcode 2067 and name the
  // offending columns (or the named unique index) in the message.
  return Object.assign(new Error(`UNIQUE constraint failed: ${failed}`), { errcode: 2067 })
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
    { entityType: 'post' as const, constraint: 'post.slug' },
    { entityType: 'page' as const, constraint: 'page.slug' },
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
    const wrapped = Object.assign(new Error('Failed query'), { cause: uniqueViolation('page.slug') })

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

  it('rethrows a non-constraint error unchanged', () => {
    const original = new Error('connection lost')

    expect(catchThrown(() => rethrowSlugConflict(original, 'page', 'hello'))).toBe(original)
  })
})
