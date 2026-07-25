// Centralised React Router route module exports for the public surface.
//
// Every public listing/detail route used to spell out the same line:
//
//   export const headers = cacheHeaders("listing"|"detail");
//
// Drift is easy in that pattern. The React Router Vite plugin requires
// route module exports to be plain `export const X = …` (it tree-shakes
// `loader`/`action`/`headers`/etc. statically), so we expose the policy
// as named constants here and let each route do
// `export const headers = listingHeaders;`. Any future tweak (a new
// cache profile) lands in this one file instead of eight.
//
// Revalidation is deliberately NOT customised: public routes rely on the
// router's default `shouldRevalidate` (revalidate on every navigation
// and action submission).

import { cacheHeaders } from '@/server/infra/http/headers'

// Listing pages: home, archives, categories, /cats/:slug, /tags/:slug,
// /search/:keyword. Short browser cache + SWR window keeps per-post
// like/view counters fresh without another round-trip on back/forward
// navigations.
export const listingHeaders = cacheHeaders('listing')

// Detail pages: post.detail, page.detail. Longer SWR window since the body
// content rarely changes between visits.
export const detailHeaders = cacheHeaders('detail')
