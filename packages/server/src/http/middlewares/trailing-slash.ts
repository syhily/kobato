import type { Env } from '@kobato/server/http/context'
import type { MiddlewareHandler } from 'hono'

/**
 * Normalise trailing slashes for public GET/HEAD routes.
 *
 *   - `/foo/`   → 301 → `/foo`
 *   - `/foo//`  → 301 → `/foo`
 *   - `/`       → untouched (root must keep its slash)
 *   - `/rpc/*`  → untouched (API perimeter)
 *   - `/health` → untouched (probe endpoints)
 *
 * This runs *before* React Router so every public page has one canonical
 * URL shape — the version without the trailing slash.
 */
export const trailingSlashNormaliser: MiddlewareHandler<Env> = async (c, next) => {
  const path = c.req.path

  // Skip non-GET/HEAD, root, and API/probe prefixes
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    return next()
  }
  if (path === '/' || path.startsWith('/rpc/') || path === '/health' || path === '/ready') {
    return next()
  }

  // Collapse multiple trailing slashes and redirect if any remain
  const normalised = path.replace(/\/+$/, '')
  if (normalised !== path) {
    const search = new URL(c.req.url).search
    const location = normalised + search
    return c.redirect(location, 301)
  }

  return next()
}
