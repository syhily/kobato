import type { RequestFacts } from '@/server/infra/http/request-facts'

/**
 * Extract the transport-agnostic request facts the domain layer is
 * allowed to see. Runs once per request at each HTTP entry seam — the
 * oRPC bridge in `app.ts` (onto `HandlerContext.requestFacts`) and the
 * route loaders that call domain services directly — so header names
 * and the URL parsing live in exactly one place.
 */
export function extractRequestFacts(request: Request): RequestFacts {
  const headers = request.headers
  return {
    path: new URL(request.url).pathname,
    userAgent: headers.get('user-agent'),
    referer: headers.get('referer'),
    acceptLanguage: headers.get('accept-language'),
    purpose: headers.get('purpose') ?? headers.get('sec-purpose'),
    cookie: headers.get('cookie'),
  }
}
