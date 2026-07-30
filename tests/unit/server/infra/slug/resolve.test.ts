import { describe, expect, it } from 'vitest'

import { DomainError } from '@/server/infra/http/errors'
import { RESERVED_SLUGS } from '@/server/infra/slug/reservation'
import { resolveSlug } from '@/server/infra/slug/resolve'
import { SLUG_MAX } from '@/shared/slug'

function expectSlugFailure(fn: () => unknown): DomainError {
  try {
    fn()
  } catch (e) {
    expect(e).toBeInstanceOf(DomainError)
    const err = e as DomainError
    expect(err.code).toBe('BAD_REQUEST')
    // EVERY failure carries the zod-style issues array pinned to the
    // `slug` field so editor errors attach to the input.
    expect(err.issues).toBeDefined()
    expect(err.issues!.length).toBeGreaterThan(0)
    expect(err.issues![0].path).toEqual(['slug'])
    return err
  }
  throw new Error('should have thrown')
}

describe('resolveSlug — explicit value wins and is validated', () => {
  it('returns a valid explicit slug for every entity kind', () => {
    expect(resolveSlug('my-slug', 'irrelevant', { entity: 'post' })).toBe('my-slug')
    expect(resolveSlug('my-slug', 'irrelevant', { entity: 'page' })).toBe('my-slug')
    expect(resolveSlug('my-slug', 'irrelevant', { entity: 'taxonomy' })).toBe('my-slug')
  })

  it('trims whitespace around the explicit slug', () => {
    expect(resolveSlug('  my-slug  ', '', { entity: 'post' })).toBe('my-slug')
    expect(resolveSlug('  my-slug  ', '', { entity: 'taxonomy' })).toBe('my-slug')
  })

  it('rejects slugs that do not match DERIVED_SLUG_PATTERN', () => {
    expectSlugFailure(() => resolveSlug('Hello', 'name', { entity: 'post' }))
    expectSlugFailure(() => resolveSlug('hello world', 'name', { entity: 'page' }))
    expectSlugFailure(() => resolveSlug('hello_world', 'name', { entity: 'taxonomy' }))
    expectSlugFailure(() => resolveSlug('-leading', 'name', { entity: 'post' }))
    expectSlugFailure(() => resolveSlug('trailing-', 'name', { entity: 'page' }))
    expectSlugFailure(() => resolveSlug('double--dash', 'name', { entity: 'taxonomy' }))
  })

  it('rejects slugs exceeding SLUG_MAX length, accepts exactly SLUG_MAX', () => {
    const tooLong = 'a'.repeat(SLUG_MAX + 1)
    expectSlugFailure(() => resolveSlug(tooLong, 'name', { entity: 'post' }))
    expectSlugFailure(() => resolveSlug(tooLong, 'name', { entity: 'taxonomy' }))
    const exact = 'a'.repeat(SLUG_MAX)
    expect(resolveSlug(exact, '', { entity: 'page' })).toBe(exact)
    expect(resolveSlug(exact, '', { entity: 'taxonomy' })).toBe(exact)
  })

  it('labels post/page errors with the entity name', () => {
    const postErr = expectSlugFailure(() => resolveSlug('Hello', 'name', { entity: 'post' }))
    expect(postErr.message).toContain('文章')
    const pageErr = expectSlugFailure(() => resolveSlug('Hello', 'name', { entity: 'page' }))
    expect(pageErr.message).toContain('页面')
  })

  it('keeps the generic taxonomy messages', () => {
    const err = expectSlugFailure(() => resolveSlug('UPPER CASE', 'name', { entity: 'taxonomy' }))
    expect(err.message).toContain('slug 格式不合法')
  })
})

describe('resolveSlug — the route-prefix fence applies to post/page only', () => {
  it('rejects every reserved slug for posts and pages, with field-path issues', () => {
    for (const slug of RESERVED_SLUGS) {
      expectSlugFailure(() => resolveSlug(slug, 'name', { entity: 'post' }))
      expectSlugFailure(() => resolveSlug(slug, 'name', { entity: 'page' }))
    }
  })

  it('allows taxonomy slugs to use reserved words', () => {
    for (const slug of ['posts', 'tags', 'cats']) {
      expect(resolveSlug(slug, 'name', { entity: 'taxonomy' })).toBe(slug)
    }
  })

  it('accepts slugs that are not reserved', () => {
    expect(resolveSlug('my-post', 'title', { entity: 'post' })).toBe('my-post')
    expect(resolveSlug('about-me', 'title', { entity: 'page' })).toBe('about-me')
  })
})

describe('resolveSlug — derivation fallback', () => {
  it('falls back to deriveSlug(name) when explicit is blank or missing', () => {
    expect(resolveSlug(undefined, 'hello', { entity: 'post' })).toBe('hello')
    expect(resolveSlug('', 'React Router', { entity: 'page' })).toBe('react-router')
    expect(resolveSlug('   ', 'hello', { entity: 'post' })).toBe('hello')
    expect(resolveSlug(undefined, '且听书吟', { entity: 'taxonomy' })).toBe('qie-ting-shu-yin')
    expect(resolveSlug('', '且听书吟', { entity: 'taxonomy' })).toBe('qie-ting-shu-yin')
  })

  it('derives Han titles via pinyin', () => {
    expect(resolveSlug(undefined, '编程', { entity: 'post' })).toBe('bian-cheng')
  })

  it('throws with field-path issues when the derivation is empty', () => {
    const postErr = expectSlugFailure(() => resolveSlug(undefined, '💯', { entity: 'post' }))
    expect(postErr.message).toContain('标题')
    const taxErr = expectSlugFailure(() => resolveSlug(undefined, '!!!', { entity: 'taxonomy' }))
    expect(taxErr.message).toContain('名称')
  })
})
