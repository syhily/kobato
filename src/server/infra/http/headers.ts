import type { HeadersFunction } from 'react-router'

// Cache-control profiles for HTML/data responses. `private` keeps shared
// CDNs from caching responses that depend on the visitor's session.
export const CACHE_PROFILES = {
  // Counters change on the order of seconds, so keep the cache small.
  listing: 'private, max-age=30, stale-while-revalidate=300',
  // Same reasoning as listing, with a longer SWR window: the body rarely changes.
  detail: 'private, max-age=60, stale-while-revalidate=600',
  // Static text; Cloudflare page rules cover CDN caching, so keep the browser cache short.
  feed: 'public, max-age=300, stale-while-revalidate=3600',
  // OG/calendar/avatar images: byte-stable for a given slug; cache hard.
  imageImmutable: 'public, max-age=86400, immutable',
} as const

// Sets `Cache-Control` only when the loader didn't, so loader responses win.
export function cacheHeaders(profile: keyof typeof CACHE_PROFILES): HeadersFunction {
  return ({ loaderHeaders }) => {
    const headers = new Headers()
    if (!loaderHeaders.has('Cache-Control')) {
      headers.set('Cache-Control', CACHE_PROFILES[profile])
    }
    headers.set('Vary', 'Cookie')
    return headers
  }
}
