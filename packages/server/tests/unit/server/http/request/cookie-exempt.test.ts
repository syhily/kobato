import { isExempt } from '@kobato/server/http/request/cookie-exempt'
import { describe, expect, it } from 'vitest'

describe('isExempt', () => {
  it.each([
    ['/feed', true],
    ['/feed/atom', true],
    ['/feed.xml', false],
    ['/feedfoo', false],
    ['/cats/tech/feed', false],
    ['/cats/tech/feed/atom', false],
    ['/tags/tech/feed', false],
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
