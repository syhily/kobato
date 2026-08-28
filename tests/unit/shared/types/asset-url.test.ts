import { describe, expect, it } from 'vitest'

import {
  EMBEDDED_FONT_ROUTE_PREFIX,
  isOnSiteOrigin,
  parseAssetUrlPath,
  STORAGE_ROUTE_PREFIX,
} from '@/shared/types/asset-url'

const HASH = 'a'.repeat(64)

describe('parseAssetUrlPath — /storage/<key>', () => {
  it('parses a storage key', () => {
    expect(parseAssetUrlPath('/storage/images/2026/05/x.jpg')).toEqual({
      key: 'images/2026/05/x.jpg',
      route: STORAGE_ROUTE_PREFIX,
    })
  })

  it('rejects an empty key and other prefixes', () => {
    expect(parseAssetUrlPath('/storage/')).toBeNull()
    expect(parseAssetUrlPath('/storage')).toBeNull()
    expect(parseAssetUrlPath('/images/foo.jpg')).toBeNull()
    expect(parseAssetUrlPath('/posts/hello')).toBeNull()
    expect(parseAssetUrlPath('/')).toBeNull()
  })
})

describe('parseAssetUrlPath — /fonts/embedded/<hash>/<file>', () => {
  it('maps the route to the fonts/<hash>/<file> storage key', () => {
    expect(parseAssetUrlPath(`/fonts/embedded/${HASH}/result.css`)).toEqual({
      key: `fonts/${HASH}/result.css`,
      route: EMBEDDED_FONT_ROUTE_PREFIX,
    })
  })

  it('accepts nested filenames', () => {
    expect(parseAssetUrlPath(`/fonts/embedded/${HASH}/sub/chunk-001.woff2`)).toEqual({
      key: `fonts/${HASH}/sub/chunk-001.woff2`,
      route: EMBEDDED_FONT_ROUTE_PREFIX,
    })
  })

  it('rejects malformed shapes', () => {
    // Missing filename, missing hash, non-hex / short / uppercase hash.
    expect(parseAssetUrlPath(`/fonts/embedded/${HASH}`)).toBeNull()
    expect(parseAssetUrlPath(`/fonts/embedded/${HASH}/`)).toBeNull()
    expect(parseAssetUrlPath('/fonts/embedded/')).toBeNull()
    expect(parseAssetUrlPath('/fonts/embedded/abc123/result.css')).toBeNull()
    expect(parseAssetUrlPath(`/fonts/embedded/${'A'.repeat(64)}/result.css`)).toBeNull()
    expect(parseAssetUrlPath(`/fonts/embedded/${'g'.repeat(64)}/result.css`)).toBeNull()
  })

  it('rejects dotfiles and hidden or empty filename segments', () => {
    expect(parseAssetUrlPath(`/fonts/embedded/${HASH}/.secret.woff2`)).toBeNull()
    expect(parseAssetUrlPath(`/fonts/embedded/${HASH}/sub/.hidden/x.woff2`)).toBeNull()
    expect(parseAssetUrlPath(`/fonts/embedded/${HASH}/sub//x.woff2`)).toBeNull()
  })
})

describe('isOnSiteOrigin', () => {
  it('matches the exact http(s) origin, ignoring a trailing slash', () => {
    expect(isOnSiteOrigin(new URL('https://blog.example.com/storage/x.jpg'), 'https://blog.example.com')).toBe(true)
    expect(isOnSiteOrigin(new URL('https://blog.example.com/storage/x.jpg'), 'https://blog.example.com/')).toBe(true)
    expect(isOnSiteOrigin(new URL('http://blog.example.com/storage/x.jpg'), 'https://blog.example.com')).toBe(false)
    expect(isOnSiteOrigin(new URL('https://other.com/storage/x.jpg'), 'https://blog.example.com')).toBe(false)
    expect(isOnSiteOrigin(new URL('https://blog.example.com:8443/storage/x.jpg'), 'https://blog.example.com')).toBe(
      false,
    )
  })
})
