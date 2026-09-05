import { describe, expect, it } from 'vitest'

import { getImageFilenameFromSrc, parseUrlPathname } from '@/nodes/base/utils/content-image-url'

describe('getImageFilenameFromSrc', () => {
  it('extracts filename from URL pathname', () => {
    expect(getImageFilenameFromSrc('https://example.com/images/photo.jpg')).toBe('photo.jpg')
  })

  it('ignores query string and hash', () => {
    expect(getImageFilenameFromSrc('https://example.com/images/photo.png?w=800#top')).toBe('photo.png')
  })

  it('returns empty string when pathname has no filename', () => {
    expect(getImageFilenameFromSrc('https://example.com/images/')).toBe('')
  })
})

describe('parseUrlPathname', () => {
  it('parses absolute URLs', () => {
    expect(parseUrlPathname('https://example.com/a/b.png?x=1')).toBe('/a/b.png')
  })

  it('passes path-shaped srcs through instead of throwing', () => {
    expect(parseUrlPathname('/content/images/a.png')).toBe('/content/images/a.png')
    // the marker is not a valid URL (underscores are not a scheme) — passthrough
    expect(parseUrlPathname('__INKLING_URL__/content/images/a.png')).toBe('__INKLING_URL__/content/images/a.png')
    // blob URLs are valid: the pathname is the inner URL's path
    expect(parseUrlPathname('blob:https://example.com/uuid')).toBe('https://example.com/uuid')
  })
})

describe('getImageFilenameFromSrc failure policy', () => {
  it('falls back to the basename of relative, marker, and blob srcs (never throws)', () => {
    expect(getImageFilenameFromSrc('/content/images/photo.jpg')).toBe('photo.jpg')
    expect(getImageFilenameFromSrc('__INKLING_URL__/content/images/photo.jpg')).toBe('photo.jpg')
    expect(getImageFilenameFromSrc('blob:https://example.com/uuid')).toBe('uuid')
  })
})
