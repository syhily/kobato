import { describe, expect, it } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import {
  canonicalPostPath,
  entityCommentUrl,
  entityPermalink,
  searchRootPath,
  trimSiteSuffix,
} from '@/shared/utils/paths'

// `canonicalPostPath` drives alias-slug 301s; `searchRootPath` is the only query encoder.
// Pin the edge cases that caused prod incidents (double-encoded CJK slugs, redirect loops).

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
    expect(canonicalPostPath('旧-标题', 'new-title')).toBe('/posts/new-title')
  })

  it('treats Chinese-character canonicals as identity (no double-encoding)', () => {
    // Canonical is interpolated literally — router segments arrive URL-decoded.
    expect(canonicalPostPath('foo', '你好-世界')).toBe('/posts/你好-世界')
  })

  it('treats empty-string slugs as different from canonical', () => {
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

// Pins the `/posts/<slug>` vs `/<slug>` split that webmention resolution and comment emails parse back apart.
describe('shared/utils/paths — entityPermalink', () => {
  it('prefixes posts with /posts/', () => {
    expect(entityPermalink('post', 'hello-world')).toBe('/posts/hello-world')
  })

  it('mounts pages at the root', () => {
    expect(entityPermalink('page', 'about')).toBe('/about')
  })

  it('keeps CJK slugs literal (router segments are already decoded)', () => {
    expect(entityPermalink('post', '你好-世界')).toBe('/posts/你好-世界')
  })
})

describe('shared/utils/paths — entityCommentUrl', () => {
  const website = TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.website

  it('joins the configured website with the permalink and a trailing slash', () => {
    expect(entityCommentUrl('post', 'hello-world')).toBe(`${website}/posts/hello-world/`)
  })

  it('joins page permalinks the same way', () => {
    expect(entityCommentUrl('page', 'about')).toBe(`${website}/about/`)
  })
})

describe('shared/utils/paths — trimSiteSuffix', () => {
  const siteTitle = TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.title

  it('strips the ` - <site title>` suffix', () => {
    expect(trimSiteSuffix(`Hello - ${siteTitle}`)).toBe('Hello')
  })

  it('leaves titles without the suffix untouched', () => {
    expect(trimSiteSuffix('Hello world')).toBe('Hello world')
  })

  it('maps null to the empty string', () => {
    expect(trimSiteSuffix(null)).toBe('')
  })
})
