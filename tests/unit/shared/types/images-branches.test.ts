import { describe, expect, it } from 'vitest'

import {
  buildPublicBaseUrlFromStorage,
  classifyImageKind,
  extractFriendHostSafe,
  getImageSrcset,
  getImageUrl,
  isSafeImageSegment,
} from '@/shared/types/images'

// --- classifyImageKind ----------------------------------------------------

describe('shared/types/images — classifyImageKind', () => {
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

// --- extractFriendHostSafe ------------------------------------------------

describe('shared/types/images — extractFriendHostSafe', () => {
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
    // A URL like `file:///x` has no hostname.
    expect(extractFriendHostSafe('file:///x')).toBeNull()
  })

  it('returns null when the hostname contains characters outside the safe segment charset', () => {
    // The safe segment charset is [a-z0-9._-]. Uppercase, tilde, and other
    // punctuation are rejected. Lowercased dotted hosts are accepted.
    expect(extractFriendHostSafe('https://example.host/x')).toBe('example.host')
    // `~` is outside the charset → rejected even though it's a valid URL char.
    expect(extractFriendHostSafe('https://exa~mple.com/x')).toBeNull()
  })
})

// --- isSafeImageSegment ---------------------------------------------------

describe('shared/types/images — isSafeImageSegment', () => {
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

// --- buildPublicBaseUrlFromStorage ---------------------------------------

describe('shared/types/images — buildPublicBaseUrlFromStorage', () => {
  it('returns null when options is undefined', () => {
    expect(buildPublicBaseUrlFromStorage(undefined)).toBeNull()
  })

  it('returns null when storage is disabled', () => {
    expect(
      buildPublicBaseUrlFromStorage({
        storageEnabled: false,
        asset: { host: 'cdn.example.com', scheme: 'https' },
      }),
    ).toBeNull()
  })

  it('returns null when asset host is the empty string', () => {
    expect(
      buildPublicBaseUrlFromStorage({
        storageEnabled: true,
        asset: { host: '', scheme: 'https' },
      }),
    ).toBeNull()
  })

  it('trims a single trailing slash from the host', () => {
    expect(
      buildPublicBaseUrlFromStorage({
        storageEnabled: true,
        asset: { host: 'cdn.example.com///', scheme: 'https' },
      }),
    ).toBe('https://cdn.example.com//')
  })

  it('builds scheme://host with trailing slash trimmed', () => {
    expect(
      buildPublicBaseUrlFromStorage({
        storageEnabled: true,
        asset: { host: 'cdn.example.com/', scheme: 'https' },
      }),
    ).toBe('https://cdn.example.com')
    expect(
      buildPublicBaseUrlFromStorage({
        storageEnabled: true,
        asset: { host: 'cdn.example.com', scheme: 'http' },
      }),
    ).toBe('http://cdn.example.com')
  })
})

// --- getImageUrl (quality + placeholder-substitution branches not in images.test.ts) ---

describe('shared/types/images — getImageUrl placeholder + quality branches', () => {
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
    // quality defaults to 100 when undefined.
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

// --- getImageSrcset -------------------------------------------------------

describe('shared/types/images — getImageSrcset', () => {
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
    // ratio preserved: 512 / (800/400) → height 256
    expect(out).toContain('/512w/')
  })

  it('filters out breakpoints larger than maxWidth (= width * 2 or 1536)', () => {
    const out = getImageSrcset({
      ...base,
      width: 400,
      height: 200,
      breakpoints: [128, 256, 512, 4096],
    })
    // width=400 → maxWidth = max(800, 1536) = 1536; 4096 filtered out
    expect(out).toContain('128w')
    expect(out).toContain('256w')
    expect(out).toContain('512w')
    expect(out).not.toContain('4096w')
  })

  it('uses the default breakpoint set when breakpoints omitted', () => {
    const out = getImageSrcset(base)
    // Default breakpoints include 256 / 512 / 768 / 1024 / 1280 / 1536
    expect(out).toContain('256w')
    expect(out).toContain('1536w')
  })
})
