import { describe, expect, it } from 'vitest'

import { getSlug, scopeFromUrl } from '@/server/render/feed/scope'

describe('render/feed/scope — getSlug', () => {
  it('returns the slug from params', () => {
    expect(getSlug({ slug: 'react' })).toBe('react')
  })

  it('returns undefined when the slug is missing', () => {
    expect(getSlug({})).toBeUndefined()
  })
})

describe('render/feed/scope — scopeFromUrl', () => {
  it('returns a category scope for /cats/ paths', () => {
    expect(scopeFromUrl('https://example.com/cats/react', 'react')).toEqual({ category: 'react' })
  })

  it('returns a tag scope for /tags/ paths', () => {
    expect(scopeFromUrl('https://example.com/tags/nextjs', 'nextjs')).toEqual({ tag: 'nextjs' })
  })

  it('returns undefined when slug is missing', () => {
    expect(scopeFromUrl('https://example.com/cats/react', undefined)).toBeUndefined()
  })

  it('returns undefined for unrelated pathnames', () => {
    expect(scopeFromUrl('https://example.com/posts/hello', 'hello')).toBeUndefined()
  })

  it('ignores paths that merely contain the prefix substring', () => {
    expect(scopeFromUrl('https://example.com/old-cats/foo', 'foo')).toBeUndefined()
  })
})
