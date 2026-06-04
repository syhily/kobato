import { describe, expect, it } from 'vitest'

import { DomainError } from '@/server/infra/http/errors'
import { RESERVED_SLUGS, ensureSlugLegal, resolveSlug } from '@/server/infra/slug-validation'
import { SLUG_MAX } from '@/shared/slug'

describe('ensureSlugLegal', () => {
  it('accepts a valid kebab-case slug', () => {
    expect(() => ensureSlugLegal('hello-world', 'post')).not.toThrow()
    expect(() => ensureSlugLegal('abc123', 'page')).not.toThrow()
    expect(() => ensureSlugLegal('a', 'post')).not.toThrow()
  })

  it('rejects slugs that do not match DERIVED_SLUG_PATTERN', () => {
    expect(() => ensureSlugLegal('Hello', 'post')).toThrow(DomainError)
    expect(() => ensureSlugLegal('hello world', 'page')).toThrow(DomainError)
    expect(() => ensureSlugLegal('hello_world', 'post')).toThrow(DomainError)
    expect(() => ensureSlugLegal('', 'post')).toThrow(DomainError)
    expect(() => ensureSlugLegal('-leading', 'page')).toThrow(DomainError)
    expect(() => ensureSlugLegal('trailing-', 'post')).toThrow(DomainError)
    expect(() => ensureSlugLegal('double--dash', 'page')).toThrow(DomainError)
  })

  it('includes the entity label in error messages', () => {
    try {
      ensureSlugLegal('Hello', 'post')
    } catch (e) {
      expect(e).toBeInstanceOf(DomainError)
      expect((e as DomainError).message).toContain('文章')
    }
    try {
      ensureSlugLegal('Hello', 'page')
    } catch (e) {
      expect(e).toBeInstanceOf(DomainError)
      expect((e as DomainError).message).toContain('页面')
    }
  })

  it('rejects slugs exceeding SLUG_MAX length', () => {
    const longSlug = 'a'.repeat(SLUG_MAX + 1)
    expect(() => ensureSlugLegal(longSlug, 'post')).toThrow(DomainError)
    // exactly at max is fine
    const maxSlug = 'a'.repeat(SLUG_MAX)
    expect(() => ensureSlugLegal(maxSlug, 'post')).not.toThrow()
  })

  it('rejects every reserved slug', () => {
    for (const slug of RESERVED_SLUGS) {
      expect(() => ensureSlugLegal(slug, 'post')).toThrow(DomainError)
    }
  })

  it('accepts slugs that are not reserved', () => {
    expect(() => ensureSlugLegal('my-post', 'post')).not.toThrow()
    expect(() => ensureSlugLegal('about-me', 'page')).not.toThrow()
  })
})

describe('resolveSlug', () => {
  it('returns the explicit slug when provided and non-empty', () => {
    expect(resolveSlug('custom-slug', 'ignored title')).toBe('custom-slug')
    expect(resolveSlug('  trimmed  ', 'ignored title')).toBe('trimmed')
  })

  it('derives from title when explicit is undefined', () => {
    expect(resolveSlug(undefined, 'hello')).toBe('hello')
    expect(resolveSlug(undefined, 'React Router')).toBe('react-router')
  })

  it('derives from title when explicit is an empty string', () => {
    expect(resolveSlug('', 'hello')).toBe('hello')
    expect(resolveSlug('   ', 'hello')).toBe('hello')
  })

  it('derives from title with Han characters', () => {
    expect(resolveSlug(undefined, '编程')).toBe('bian-cheng')
  })

  it('throws DomainError when title produces an empty derived slug', () => {
    expect(() => resolveSlug(undefined, '💯')).toThrow(DomainError)
    expect(() => resolveSlug(undefined, '!!!')).toThrow(DomainError)
    expect(() => resolveSlug(undefined, '   ')).toThrow(DomainError)
  })

  it('throws with path-annotated error for empty derived slug', () => {
    try {
      resolveSlug(undefined, '!!!')
    } catch (e) {
      expect(e).toBeInstanceOf(DomainError)
      const err = e as DomainError
      expect(err.issues).toBeDefined()
      expect(err.issues!.length).toBeGreaterThan(0)
      expect(err.issues![0].path).toEqual(['slug'])
    }
  })
})
