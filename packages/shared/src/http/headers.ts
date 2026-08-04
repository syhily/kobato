import type { HeadersFunction } from 'react-router'

// Single owner of the Cache-Control contract shared by the core SSR
// loaders and the public frontend. Both apps serve the same public URL
// surface, so the profile table must stay byte-identical across the two
// deployments.
//
// React Router merges the `headers` export with the loader's own response
// headers, so each data-type route can opt into a profile without
// re-stating the constants.
//
// The `private` directive prevents shared CDNs from caching responses that
// depend on the visitor's session (admin flag, comment author cookies);
// `s-maxage=0` is conservative belt-and-braces — the public site uses
// `Set-Cookie` from middleware which already disables CDN caching, but
// stating it explicitly keeps the contract obvious to anyone reading the
// route module.
export const CACHE_PROFILES = {
  // Listing pages (home, archives, categories, tags, search index): the
  // catalog updates only on deploy, but per-post like/view counters change
  // on the order of seconds. Hand the browser a small private cache + SWR
  // window so back/forward feels instant without showing visibly stale
  // counters.
  listing: 'private, max-age=30, stale-while-revalidate=300',
  // Detail pages (post, page): same reasoning as listing but with a longer
  // SWR window since the body content rarely changes between visits.
  detail: 'private, max-age=60, stale-while-revalidate=600',
  // Feed/sitemap: served as static text with a short browser cache. We don't
  // CDN-cache them because the public domain is fronted by Cloudflare which
  // has its own page rules for these paths.
  feed: 'public, max-age=300, stale-while-revalidate=3600',
  // OG/calendar/avatar images: byte-stable for a given slug; cache hard.
  imageImmutable: 'public, max-age=86400, immutable',
} as const

// Returns a `headers` export that sets `Cache-Control` only when the loader
// didn't already set one. React Router merges `headers()` with `loaderHeaders`,
// so we let loader responses (e.g. error redirects, Set-Cookie commits) win.
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

// Centralised route-module header exports: the React Router Vite plugin
// requires route module exports to be plain `export const X = …`, so each
// listing/detail route aliases one of these named constants
// (`export const headers = listingHeaders;`). Any future tweak (a new
// cache profile) lands here instead of in every route.
//
// Listing pages: home, archives, categories, /cats/:slug, /tags/:slug,
// /search/:keyword. Short browser cache + SWR window keeps per-post
// like/view counters fresh without another round-trip on back/forward
// navigations.
export const listingHeaders = cacheHeaders('listing')

// Detail pages: post.detail, page.detail. Longer SWR window since the body
// content rarely changes between visits.
export const detailHeaders = cacheHeaders('detail')
