import { Hono } from 'hono'

import type { Env } from '@/server/http/context'

// 301 collapses for legacy entry points (`/tags` → `/`, `/search` → the
// path-style search endpoint) so inbound links and bookmarks keep resolving.
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
