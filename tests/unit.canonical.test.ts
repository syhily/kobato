import { describe, expect, it } from 'vitest'

import { canonicalPostPath, searchRootPath } from '@/shared/utils/paths'

// `canonicalPostPath` is what drives our alias-slug 301 redirects, and
// `searchRootPath` is the only place query encoding happens for the search
// landing URL. Both look trivial but each has a handful of edge cases that
// have caused real prod incidents (Chinese slugs encoded twice, alias=
// canonical triggering a redirect loop, etc.) — pin them.

describe('routes/_shared/canonicalPostPath', () => {
  it('returns the canonical /posts/<slug> when alias differs', () => {
    expect(canonicalPostPath('legacy-2014', 'hello-world')).toBe('/posts/hello-world')
  })

  it('returns undefined when alias === canonical (no redirect loop)', () => {
    expect(canonicalPostPath('hello-world', 'hello-world')).toBeUndefined()
  })

  it('returns undefined when requested slug is missing (router parsed nothing)', () => {
    expect(canonicalPostPath(undefined, 'hello-world')).toBeUndefined()
  })

  it('treats Chinese slug differences as redirect-worthy', () => {
    // Real example: /posts/旧-标题 → /posts/new-title
    expect(canonicalPostPath('旧-标题', 'new-title')).toBe('/posts/new-title')
  })

  it('treats Chinese-character canonicals as identity (no double-encoding)', () => {
    // The canonical itself is interpolated literally; no encodeURI happens
    // because router segments are already URL-decoded by the time the loader
    // reads them.
    expect(canonicalPostPath('foo', '你好-世界')).toBe('/posts/你好-世界')
  })

  it('treats empty-string slugs as different from canonical', () => {
    // The router never feeds us "" but be defensive — empty !== canonical.
    expect(canonicalPostPath('', 'hello-world')).toBe('/posts/hello-world')
  })
})

describe('routes/_shared/searchRootPath', () => {
  it('encodes Chinese queries', () => {
    expect(searchRootPath('你好')).toBe(`/search/${encodeURIComponent('你好')}`)
  })

  it('encodes special characters that would otherwise break the URL', () => {
    expect(searchRootPath('a&b=c?d')).toBe('/search/a%26b%3Dc%3Fd')
  })

  it('preserves unreserved ASCII unchanged', () => {
    expect(searchRootPath('simple')).toBe('/search/simple')
  })

  it("encodes spaces as %20 (not '+', which is form-style not path-style)", () => {
    expect(searchRootPath('a b')).toBe('/search/a%20b')
  })
})
