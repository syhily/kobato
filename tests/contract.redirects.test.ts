import { describe, expect, it } from 'vitest'

import { canonicalPostPath } from '@/shared/utils/paths'

// Redirect contract for post aliases: opening a post via a legacy alias
// must always redirect (HTTP 301) to its canonical /posts/<slug> URL so
// search engines collapse the duplicates. The redirect status must be 301
// (permanent) — 302 would let the alias keep accumulating link equity.

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
