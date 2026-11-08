// Centralised `headers` exports for the public routes — the RR Vite plugin
// tree-shakes route exports statically, so each route re-exports a named
// constant from here. Revalidation deliberately uncustomised (router default).

import { cacheHeaders } from '@/server/infra/http/headers'

// Listing pages (home, archives, categories, tags, search): `no-cache` — the
// UI locale is a global setting on a fixed URL, so a stored copy must
// revalidate instead of painting the previous language on back/forward.
export const listingHeaders = cacheHeaders('listing')

// Detail pages: same revalidate-on-use rule; a 200 revalidates through the
// full-payload ETag, a matching `If-None-Match` answers 304 with the same headers.
export const detailHeaders = cacheHeaders('detail')
