/**
 * Transport-agnostic request facts, extracted once at the HTTP seam so the
 * domain layer never touches the raw `Request`. The proxy-aware client
 * address is deliberately absent (threaded separately as `clientAddress`).
 */
export interface RequestFacts {
  /** Normalized pathname: `.data` suffixes and `_routes` / `index` params stripped. */
  path: string
  /** True for React Router data requests (client navigation / fetcher revalidation). */
  isDataRequest: boolean
  userAgent: string | null
  referer: string | null
  acceptLanguage: string | null
  /** `Purpose` header, falling back to `Sec-Purpose` (prefetch hints). */
  purpose: string | null
  /** Raw `Cookie` header — domains parse the cookies they own out of it. */
  cookie: string | null
}
