import type { RequestFacts } from '@kobato/server/infra/http/request-facts'

/**
 * Normalize a request URL to its document form, mirroring React Router
 * v8's own normalization (`v8_passThroughRequests` passes the RAW request
 * through, so the `.data` plumbing is visible at the HTTP seam):
 *
 *  - `/a/b/c.data`   → `/a/b/c`
 *  - `/a/b/c/_.data` → `/a/b/c/` (trailing-slash data requests)
 *  - `/_.data`       → `/`       (root data request)
 *  - `_routes` / `index` search params are stripped.
 *
 * This is the single owner of that normalization — consumers (the
 * request-context derivation, the install gate, route loaders) must use
 * it instead of hand-stripping `.data` locally.
 */
export function normalizeDocumentUrl(url: URL): URL {
  const normalized = new URL(url.href)
  const { pathname } = normalized
  if (pathname.endsWith('/_.data')) {
    // Covers the root case too: '/_.data' → '' + '/'.
    normalized.pathname = `${pathname.slice(0, -'/_.data'.length)}/`
  } else if (pathname.endsWith('.data')) {
    normalized.pathname = pathname.slice(0, -'.data'.length)
  }
  normalized.searchParams.delete('_routes')
  normalized.searchParams.delete('index')
  return normalized
}

/** True when the raw URL is a React Router data request (`.data` / `_.data`). */
export function isDataRequestUrl(url: URL): boolean {
  return url.pathname.endsWith('.data')
}

/**
 * Extract the transport-agnostic request facts the domain layer is
 * allowed to see. Runs once per request in the request-context middleware
 * (`@/server/http/middlewares/request-context`) and rides the canonical
 * `RequestContext` — header names and URL normalization live in exactly
 * one place.
 */
export function extractRequestFacts(request: Request): RequestFacts {
  const headers = request.headers
  const rawUrl = new URL(request.url)
  return {
    path: normalizeDocumentUrl(rawUrl).pathname,
    isDataRequest: isDataRequestUrl(rawUrl),
    userAgent: headers.get('user-agent'),
    referer: headers.get('referer'),
    acceptLanguage: headers.get('accept-language'),
    purpose: headers.get('purpose') ?? headers.get('sec-purpose'),
    cookie: headers.get('cookie'),
  }
}
