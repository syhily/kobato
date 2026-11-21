import {
  classifyImageKind,
  extractFriendHostSafe,
  friendPosterStoragePath,
  friendPosterStoragePathFromUrl,
  getImageSrcset,
  getImageUrl,
  isSafeImageSegment,
  retargetFriendPosterUrl,
} from '@kobato/assets/images'
import { describe, expect, it } from 'vitest'

describe('assets/images — classifyImageKind', () => {
  it('returns "category" for images/categories/ prefix', () => {
    expect(classifyImageKind('images/categories/foo.png')).toBe('category')
  })

  it('returns "friend" for images/links/ prefix', () => {
    expect(classifyImageKind('images/links/bar.png')).toBe('friend')
  })

  it('returns "generic" for any other path', () => {
    expect(classifyImageKind('images/generic/x.png')).toBe('generic')
    expect(classifyImageKind('posts/cover.png')).toBe('generic')
    expect(classifyImageKind('')).toBe('generic')
  })
})

describe('assets/images — extractFriendHostSafe', () => {
  it('returns null for empty / whitespace-only input', () => {
    expect(extractFriendHostSafe('')).toBeNull()
    expect(extractFriendHostSafe('   ')).toBeNull()
  })

  it('returns null for non-URL strings', () => {
    expect(extractFriendHostSafe('not a url')).toBeNull()
  })

  it('returns the lowercased hostname for valid URLs', () => {
    expect(extractFriendHostSafe('https://Example.COM/path')).toBe('example.com')
  })

  it('returns null when the hostname is empty', () => {
    expect(extractFriendHostSafe('file:///x')).toBeNull()
  })

  it('returns null when the hostname contains characters outside the safe segment charset', () => {
    expect(extractFriendHostSafe('https://example.host/x')).toBe('example.host')
    expect(extractFriendHostSafe('https://exa~mple.com/x')).toBeNull()
  })
})

describe('assets/images — isSafeImageSegment', () => {
  it('returns false for empty / whitespace-only input', () => {
    expect(isSafeImageSegment('')).toBe(false)
    expect(isSafeImageSegment('   ')).toBe(false)
  })

  it('returns true for lowercase ascii segments with - . _', () => {
    expect(isSafeImageSegment('my-cover_1.png')).toBe(true)
    expect(isSafeImageSegment('abc-123')).toBe(true)
  })

  it('returns false when uppercase or other chars are present', () => {
    expect(isSafeImageSegment('Foo')).toBe(false)
    expect(isSafeImageSegment('a/b')).toBe(false)
    expect(isSafeImageSegment('a b')).toBe(false)
  })
})

describe('assets/images — friend poster paths', () => {
  it('derives the storage path from the normalized homepage host', () => {
    expect(friendPosterStoragePath('https://Example.COM:8443/about')).toBe('images/links/example.com.jpg')
    expect(friendPosterStoragePath('not-a-url')).toBeNull()
  })

  it('accepts only uploaded friend poster URLs', () => {
    expect(friendPosterStoragePathFromUrl('/storage/images/links/example.com.jpg?v=12')).toBe(
      'images/links/example.com.jpg',
    )
    expect(friendPosterStoragePathFromUrl('https://site.example/storage/images/links/example.com.jpg?v=12')).toBe(
      'images/links/example.com.jpg',
    )
    expect(friendPosterStoragePathFromUrl('https://example.com/poster.jpg')).toBeNull()
    expect(friendPosterStoragePathFromUrl('/storage/images/2026/example.jpg')).toBeNull()
  })

  it('retargets relative and absolute poster URLs while preserving their version', () => {
    expect(retargetFriendPosterUrl('/storage/images/links/old.com.jpg?v=12', 'https://new.com/about')).toBe(
      '/storage/images/links/new.com.jpg?v=12',
    )
    expect(
      retargetFriendPosterUrl('https://site.example/storage/images/links/old.com.jpg?v=12', 'https://new.com'),
    ).toBe('https://site.example/storage/images/links/new.com.jpg?v=12')
    expect(retargetFriendPosterUrl('https://old.com/custom.jpg', 'https://new.com')).toBeNull()
  })
})

describe('assets/images — getImageUrl placeholder + quality branches', () => {
  const opts = {
    src: 'https://cdn.example.com/img.jpg',
    width: 100,
    height: 50,
    assetHost: 'cdn.example.com',
    urlTemplate: '/cdn/{width}/{height}/{src}{quality}',
  }

  it('substitutes width/height/src placeholders and defaults quality to 100', () => {
    const url = getImageUrl(opts)
    expect(url).toContain('/cdn/100/50/')
    expect(url).toContain('img.jpg')
    expect(url).toContain('100')
  })

  it('honors an explicit numeric quality', () => {
    const url = getImageUrl({ ...opts, quality: 42 })
    expect(url).toContain('42')
  })

  it('substitutes {src} when present in the template', () => {
    const url = getImageUrl({ ...opts, urlTemplate: '/resize?u={src}&w={width}' })
    expect(url).toBe('/resize?u=https://cdn.example.com/img.jpg&w=100')
  })
})

describe('assets/images — getImageSrcset', () => {
  const base = {
    src: 'https://cdn.example.com/img.jpg',
    width: 800,
    height: 400,
    assetHost: 'cdn.example.com',
    urlTemplate: '/{width}w/{src}',
  }

  it('returns an empty string when not transformable', () => {
    expect(getImageSrcset({ ...base, src: 'https://other.example.com/img.jpg' })).toBe('')
  })

  it('returns an empty string when the template is empty', () => {
    expect(getImageSrcset({ ...base, urlTemplate: '  ' })).toBe('')
  })

  it('renders srcset entries for each breakpoint up to maxWidth', () => {
    const out = getImageSrcset({ ...base, breakpoints: [256, 512] })
    expect(out).toContain('256w')
    expect(out).toContain('512w')
    expect(out).toContain('/512w/')
  })

  it('filters out breakpoints larger than maxWidth (= width * 2 or 1536)', () => {
    const out = getImageSrcset({
      ...base,
      width: 400,
      height: 200,
      breakpoints: [128, 256, 512, 4096],
    })
    expect(out).toContain('128w')
    expect(out).toContain('256w')
    expect(out).toContain('512w')
    expect(out).not.toContain('4096w')
  })

  it('uses the default breakpoint set when breakpoints omitted', () => {
    const out = getImageSrcset(base)
    expect(out).toContain('256w')
    expect(out).toContain('1536w')
  })
})
