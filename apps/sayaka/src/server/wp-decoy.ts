import type { Env } from '@sayaka/server/hono-env'

import { createMiddleware } from 'hono/factory'

const LEGIT_WP_PATHS = new Set(['/admin/signin', '/admin', '/admin/', '/admin/setup'])

export function isWordPressDecoyPath(pathname: string): boolean {
  if (LEGIT_WP_PATHS.has(pathname)) {
    return false
  }

  if (pathname.startsWith('/wp-content/')) {
    return true
  }
  if (pathname.startsWith('/wp-includes/')) {
    return true
  }
  if (pathname === '/cgi-bin' || pathname.startsWith('/cgi-bin/')) {
    return true
  }
  if (pathname.endsWith('.php')) {
    return true
  }

  return false
}

export const NOT_WORDPRESS_STATUS_TEXT = 'Not WordPress'

export const honoWpDecoyMiddleware = createMiddleware<Env>(async (c, next) => {
  if (isWordPressDecoyPath(c.req.path)) {
    return c.text(NOT_WORDPRESS_STATUS_TEXT, {
      status: 404,
      statusText: NOT_WORDPRESS_STATUS_TEXT,
    })
  }
  await next()
})
