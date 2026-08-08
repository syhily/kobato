// Centralised `headers` exports for the public routes — the RR Vite plugin
// tree-shakes route exports statically, so each route re-exports a named
// constant from here. Revalidation deliberately uncustomised (router default).

import { cacheHeaders } from '@/server/infra/http/headers'

// Listing pages (home, archives, categories, tags, search): short browser
// cache + SWR window keeps like/view counters fresh on back/forward.
export const listingHeaders = cacheHeaders('listing')

// Detail pages: longer SWR window — the body rarely changes between visits.
export const detailHeaders = cacheHeaders('detail')
