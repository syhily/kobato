import type { Env } from '@kobato/server/http/hono-env'
import type { MiddlewareHandler } from 'hono'

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
