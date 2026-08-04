import { createMiddleware } from 'hono/factory'

/**
 * Process-local short-TTL cache for the frontend's proxied URL endpoints.
 *
 * The GET proxy relays every request to core — feeds and the sitemap are
 * regenerated per request by core's render pipeline (with its own
 * short-lived registry cache behind `Cache-Control: public, max-age=…`).
 * Under the two-service topology each of those requests is a full
 * loopback round-trip, so the frontend holds a process-internal copy for
 * the same window core advertises — the browser-facing semantics do not
 * change (the visitor still gets the same max-age), but repeat hits stop
 * re-rendering the payload on core.
 *
 * Semantics:
 *   - keyed by the FULL request URL (pathname + search) — `/cats/:slug`
 *     style patterns are distinct keys per concrete URL;
 *   - only 200 responses are stored; a non-200 response (503 from an
 *     unreachable core, 404, …) is never cached, and an existing entry
 *     survives a transient failure until its TTL lapses (serve-stale);
 *   - a conditional request whose `If-None-Match` matches the cached
 *     ETag answers 304 from the cache;
 *   - HEAD requests hit the cache too, returning the cached headers with
 *     an empty body;
 *   - the cache is unbounded per instance — every entry is a concrete
 *     feed/sitemap URL (bounded by the site's category/tag count), and
 *     entries expire on their TTL. Each `createUrlProxyApp` instance
 *     (one per process) owns its own map.
 */

export interface EndpointCacheOptions {
  /** How long a cached 200 stays fresh. */
  ttlMs: number
}

interface CacheEntry {
  body: string
  headers: Headers
  expiresAt: number
}

export function createEndpointCache(options: EndpointCacheOptions) {
  const { ttlMs } = options
  const cache = new Map<string, CacheEntry>()

  return createMiddleware(async (c, next) => {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      return next()
    }

    const key = new URL(c.req.raw.url).href
    const entry = cache.get(key)
    if (entry !== undefined && entry.expiresAt > Date.now()) {
      const ifNoneMatch = c.req.header('if-none-match')
      // Deliberately a plain strict-equality comparison, not full RFC 7232
      // semantics (lists, `W/` weak prefixes, `*`): browsers send the
      // cached response's own ETag verbatim and core's feed/sitemap
      // endpoints don't emit ETags at all, so only a defensive single
      // strong-tag match can ever occur here.
      if (ifNoneMatch !== null && entry.headers.get('etag') === ifNoneMatch) {
        return new Response(null, { status: 304, headers: entry.headers })
      }
      return new Response(c.req.method === 'HEAD' ? null : entry.body, { status: 200, headers: entry.headers })
    }

    await next()

    if (c.res.status !== 200) {
      // Never cache failures; a stale-but-fresh-enough entry above keeps
      // serving until its TTL lapses.
      return
    }

    // Buffer the (small) feed/sitemap payload so the cache holds a
    // reusable copy. `content-length` is dropped — the stored body is
    // re-serialized per hit and the header would otherwise go stale.
    const body = await c.res.text()
    const headers = new Headers(c.res.headers)
    headers.delete('content-length')
    cache.set(key, { body, headers, expiresAt: Date.now() + ttlMs })
    c.res = new Response(body, { status: 200, headers })
  })
}
