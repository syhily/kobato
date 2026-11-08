import { describe, expect, it } from 'vitest'

import { CACHE_PROFILES, cacheHeaders } from '@/server/infra/http/headers'

describe('server/infra/http/headers — CACHE_PROFILES', () => {
  it('exposes a non-empty string for every documented profile', () => {
    expect(CACHE_PROFILES.listing.length).toBeGreaterThan(0)
    expect(CACHE_PROFILES.detail.length).toBeGreaterThan(0)
    expect(CACHE_PROFILES.imageImmutable.length).toBeGreaterThan(0)
  })

  it('makes the localized HTML profiles private and revalidate-on-use', () => {
    // The UI locale is a global setting behind a fixed URL: a stored copy that
    // does not revalidate keeps painting the previous language in other tabs.
    expect(CACHE_PROFILES.listing).toBe('private, no-cache')
    expect(CACHE_PROFILES.detail).toBe('private, no-cache')
  })

  it('has no dead feed profile (feed responses own their public, no-cache header)', () => {
    expect(CACHE_PROFILES).not.toHaveProperty('feed')
  })

  it('marks image profile as immutable', () => {
    expect(CACHE_PROFILES.imageImmutable).toContain('immutable')
  })
})

describe('server/infra/http/headers — cacheHeaders', () => {
  it('applies the profile when loader did not set Cache-Control', () => {
    const fn = cacheHeaders('listing')
    const headers = new Headers(fn({ loaderHeaders: new Headers() } as never))
    expect(headers.get('Cache-Control')).toBe(CACHE_PROFILES.listing)
    expect(headers.get('Vary')).toBe('Cookie')
  })

  it('lets a loader-set Cache-Control win and preserves it (RR does not merge loader headers)', () => {
    const fn = cacheHeaders('detail')
    const headers = new Headers(fn({ loaderHeaders: new Headers({ 'Cache-Control': 'no-store' }) } as never))
    expect(headers.get('Cache-Control')).toBe('no-store')
    expect(headers.get('Vary')).toBe('Cookie')
  })

  it('copies the loader ETag and Content-Language into the route headers', () => {
    const fn = cacheHeaders('detail')
    const headers = new Headers(
      fn({
        loaderHeaders: new Headers({ ETag: 'W/"detail"', 'Content-Language': 'zh-TW' }),
      } as never),
    )
    expect(headers.get('ETag')).toBe('W/"detail"')
    expect(headers.get('Content-Language')).toBe('zh-TW')
  })

  it('always adds Vary: Cookie', () => {
    const fn = cacheHeaders('detail')
    const headers = new Headers(fn({ loaderHeaders: new Headers({ 'Cache-Control': 'max-age=10' }) } as never))
    expect(headers.get('Vary')).toBe('Cookie')
  })
})
