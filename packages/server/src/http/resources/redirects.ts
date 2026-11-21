import type { Env } from '@kobato/server/http/hono-env'

import { Hono } from 'hono'

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
