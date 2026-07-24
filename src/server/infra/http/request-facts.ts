/**
 * Transport-agnostic facts about the incoming request. Extracted once at
 * the HTTP seam (`@/server/http/utils/request-facts`) and handed to
 * domain services so the domain layer never depends on the raw
 * `Request` object.
 *
 * The fields are exactly the ones domain services read off the request
 * today — add a field only when a domain service starts reading it.
 * The client address is deliberately NOT here: it is derived from the
 * connection (proxy-aware) by `@/server/http/utils/client-address` and
 * threaded separately as `clientAddress`.
 */
export interface RequestFacts {
  /** URL pathname of the request (`new URL(request.url).pathname`). */
  path: string
  /** `User-Agent` header. */
  userAgent: string | null
  /** `Referer` header. */
  referer: string | null
  /** `Accept-Language` header. */
  acceptLanguage: string | null
  /** `Purpose` header, falling back to `Sec-Purpose` (prefetch hints). */
  purpose: string | null
  /** Raw `Cookie` header — domains parse the cookies they own out of it. */
  cookie: string | null
}
