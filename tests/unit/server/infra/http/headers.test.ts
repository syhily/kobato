import { describe, expect, it } from 'vitest'

import { CACHE_PROFILES, cacheHeaders } from '@/server/infra/http/headers'

describe('server/infra/http/headers — CACHE_PROFILES', () => {
  it('exposes a non-empty string for every documented profile', () => {
    expect(CACHE_PROFILES.listing.length).toBeGreaterThan(0)
    expect(CACHE_PROFILES.detail.length).toBeGreaterThan(0)
    expect(CACHE_PROFILES.feed.length).toBeGreaterThan(0)
    expect(CACHE_PROFILES.imageImmutable.length).toBeGreaterThan(0)
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

  it('does not emit Cache-Control when the loader already set one (React Router merges separately)', () => {
    const fn = cacheHeaders('detail')
    const headers = new Headers(fn({ loaderHeaders: new Headers({ 'Cache-Control': 'no-store' }) } as never))
    expect(headers.get('Cache-Control')).toBeNull()
    expect(headers.get('Vary')).toBe('Cookie')
  })

  it('always adds Vary: Cookie', () => {
    const fn = cacheHeaders('feed')
    const headers = new Headers(fn({ loaderHeaders: new Headers({ 'Cache-Control': 'max-age=10' }) } as never))
    expect(headers.get('Vary')).toBe('Cookie')
  })
})
