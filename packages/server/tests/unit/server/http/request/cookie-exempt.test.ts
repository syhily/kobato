import { isExempt } from '@kobato/server/http/request/cookie-exempt'
import { describe, expect, it } from 'vitest'

describe('isExempt', () => {
  it.each([
    ['/feed', false],
    ['/feed/atom', false],
    ['/feed.xml', false],
    ['/feedfoo', false],
    ['/cats/tech/feed', false],
    ['/cats/tech/feed/atom', false],
    ['/tags/tech/feed', false],
    ['/__manifest', false],
    ['/api/health', false],
    ['/api/rum/intake/rum/v1/default/rum', false],
    ['/assets/main.js', false],
    ['/admin/assets/entry-abc.js', true],
    ['/admin/assets/root-BEoV0Dgy.css', true],
    ['/sitemap.xml', false],
    ['/images/og/posts/hello.png', false],
    ['/', false],
    ['/posts/hello', false],
  ])('isExempt(%s) === %s', (pathname, expected) => {
    expect(isExempt(pathname)).toBe(expected)
  })
})
