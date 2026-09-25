import { describe, expect, it } from 'vitest'

import { isExempt } from '@/server/http/utils/cookie-exempt'

describe('isExempt', () => {
  it.each([
    // The real feed routes: exact `/feed` plus the `/feed/` sub-paths.
    ['/feed', true],
    ['/feed/atom', true],
    // Not feed routes — a bare `/feed` prefix used to exempt these, skipping
    // CSRF minting and turning the missing route into a 500 instead of a 404.
    ['/feed.xml', false],
    ['/feedfoo', false],
    // The cats/tags feed URLs never matched the prefix — behavior preserved.
    ['/cats/tech/feed', false],
    ['/cats/tech/feed/atom', false],
    ['/tags/tech/feed', false],
    // The other prefixes are unchanged.
    ['/__manifest', true],
    ['/assets/main.js', true],
    ['/build/chunk.js', true],
    ['/api/health', true],
    ['/sitemap.xml', true],
    ['/images/og/posts/hello.png', true],
    ['/', false],
    ['/posts/hello', false],
  ])('isExempt(%s) === %s', (pathname, expected) => {
    expect(isExempt(pathname)).toBe(expected)
  })
})
