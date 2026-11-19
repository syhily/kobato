import { canonicalPostPath } from '@kobato/server/domains/content/urls.ts'
import { describe, expect, it } from 'vitest'

describe('contract: post alias redirects', () => {
  it('returns the canonical /posts/<slug> URL when an alias was requested', () => {
    expect(canonicalPostPath('legacy-slug', 'new-slug')).toBe('/posts/new-slug')
  })

  it('returns undefined (no redirect) when the slug already matches canonical', () => {
    expect(canonicalPostPath('same', 'same')).toBeUndefined()
  })

  it('returns undefined when the slug param is missing', () => {
    expect(canonicalPostPath(undefined, 'anything')).toBeUndefined()
  })
})
