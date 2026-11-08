import type { HeadersFunction } from 'react-router'

// Cache-control profiles for HTML/data responses. `private` keeps shared
// CDNs from caching responses that depend on the visitor's session.
export const CACHE_PROFILES = {
  // The UI locale is a GLOBAL setting on a fixed URL: a stored document must
  // revalidate before reuse, or a tab (or a back/forward entry) that switched
  // language keeps painting the old one.
  listing: 'private, no-cache',
  detail: 'private, no-cache',
  // OG/calendar/avatar images: byte-stable for a given slug; cache hard.
  imageImmutable: 'public, max-age=86400, immutable',
} as const

/** Headers that describe the representation, not the request/response envelope. */
const REPRESENTATION_HEADERS = ['ETag', 'Content-Language', 'Cache-Control', 'Vary'] as const

/**
 * The ROOT route's `headers` export.
 *
 * React Router rebuilds document headers from the route `headers()` functions.
 * A loader-thrown 304 is a route ERROR: RR slices `matches` to the nearest
 * error boundary (the root) and hands the thrown Response's headers to the
 * root as `errorHeaders`. Without this pass-through the 304 loses its ETag,
 * Content-Language, Cache-Control and Vary — and 304 responses never reach
 * `entry.server.tsx`, so nothing else can restore them.
 */
export const documentHeaders: HeadersFunction = ({ parentHeaders, errorHeaders }) => {
  const headers = new Headers(parentHeaders)
  if (errorHeaders !== undefined) {
    for (const name of REPRESENTATION_HEADERS) {
      const value = errorHeaders.get(name)
      if (value !== null) {
        headers.set(name, value)
      }
    }
  }
  return headers
}

// Sets `Cache-Control` only when the loader didn't, so loader responses win.
// Representation headers set BY THE LOADER (`ETag` on the detail paths) must
// be copied explicitly: RR only merges `Set-Cookie` from loader headers into
// the output of a route `headers()` function.
export function cacheHeaders(profile: keyof typeof CACHE_PROFILES): HeadersFunction {
  return ({ loaderHeaders }) => {
    const headers = new Headers()
    const etag = loaderHeaders.get('ETag')
    if (etag !== null) {
      headers.set('ETag', etag)
    }
    const contentLanguage = loaderHeaders.get('Content-Language')
    if (contentLanguage !== null) {
      headers.set('Content-Language', contentLanguage)
    }
    headers.set('Cache-Control', loaderHeaders.get('Cache-Control') ?? CACHE_PROFILES[profile])
    headers.set('Vary', 'Cookie')
    return headers
  }
}
