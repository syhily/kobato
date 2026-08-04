import type { Env } from '@kobato/server/http/context'

import { Hono } from 'hono'

// Index-style redirects for legacy navigation entry points. The
// `/tags` and `/search` URLs predate the resource-route refactor;
// they now collapse onto the canonical surface (homepage + the
// `/search/<keyword>` path-style search endpoint) with a 301 so
// any inbound link or bookmark keeps resolving.
//
// Lives in `server/http/resources/` with the other non-JSON resource
// endpoints (feed/sitemap/images), not in the SSR wiring file.

export const redirectsRouter = new Hono<Env>()

redirectsRouter.get('/tags', (c) => {
  c.header('Cache-Control', 'public, max-age=86400, s-maxage=604800, immutable')
  return c.redirect('/', 301)
})

redirectsRouter.get('/search', (c) => {
  const query = c.req.query('q')?.trim() ?? ''
  c.header('Cache-Control', 'public, max-age=86400, s-maxage=604800, immutable')
  return c.redirect(query ? `/search/${encodeURIComponent(query)}` : '/', 301)
})
