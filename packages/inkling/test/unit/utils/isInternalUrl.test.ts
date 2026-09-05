import { describe, expect, it } from 'vitest'

import { isInternalUrl } from '@/utils/isInternalUrl'

describe('isInternalUrl', () => {
  it('returns false when url or siteUrl is missing', () => {
    expect(isInternalUrl('', 'https://example.com')).toBe(false)
    expect(isInternalUrl('https://example.com/post', '')).toBe(false)
    expect(isInternalUrl('https://example.com/post')).toBe(false)
  })

  it('returns true for urls on the same hostname and subdir', () => {
    expect(isInternalUrl('https://example.com/blog/post/', 'https://example.com/blog/')).toBe(true)
    expect(isInternalUrl('https://example.com/blog/post', 'https://example.com/blog')).toBe(true)
  })

  it('returns false for a different hostname', () => {
    expect(isInternalUrl('https://other.com/blog/post', 'https://example.com/blog')).toBe(false)
  })

  it('returns false when the pathname is outside the site subdir', () => {
    expect(isInternalUrl('https://example.com/news/post', 'https://example.com/blog')).toBe(false)
  })

  it('returns false for malformed urls', () => {
    expect(isInternalUrl('not a url', 'https://example.com')).toBe(false)
    expect(isInternalUrl('https://example.com', 'not a url')).toBe(false)
  })
})
