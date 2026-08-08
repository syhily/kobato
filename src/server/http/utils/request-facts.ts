import type { RequestFacts } from '@/server/infra/http/request-facts'

/**
 * Normalize a request URL to its document form (`.data`/`_.data` stripped,
 * `_routes`/`index` params removed) — the single owner; consumers must not
 * hand-strip `.data` locally.
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

/** Transport-agnostic facts the domain layer may see — extracted once per
 *  request; header names and URL normalization live in exactly one place. */
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
