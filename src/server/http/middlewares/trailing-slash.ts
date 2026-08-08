import type { MiddlewareHandler } from 'hono'

import type { Env } from '@/server/http/context'

/**
 * 301-normalise trailing slashes on public GET/HEAD routes (root, `/rpc/*`
 * and probes untouched) — runs before React Router so every public page has
 * one canonical URL shape.
 */
export const trailingSlashNormaliser: MiddlewareHandler<Env> = async (c, next) => {
  const path = c.req.path

  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    return next()
  }
  if (path === '/' || path.startsWith('/rpc/') || path === '/health' || path === '/ready') {
    return next()
  }

  const normalised = path.replace(/\/+$/, '')
  if (normalised !== path) {
    const search = new URL(c.req.url).search
    const location = normalised + search
    return c.redirect(location, 301)
  }

  return next()
}
