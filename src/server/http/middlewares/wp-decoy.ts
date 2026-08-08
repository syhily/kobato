import { createMiddleware } from 'hono/factory'

import type { Env } from '@/server/http/context'

// WordPress probe detector: the real admin borrows WP URL shapes; everything
// else that looks like a WP install is answered with a custom 404 whose
// `statusText: "Not WordPress"` the root ErrorBoundary switches on.

const LEGIT_WP_PATHS = new Set(['/admin/signin', '/admin', '/admin/', '/admin/setup'])

export function isWordPressDecoyPath(pathname: string): boolean {
  if (LEGIT_WP_PATHS.has(pathname)) {
    return false
  }

  // No `/admin/*` blanket rule — the real SPA shell serves clean paths there; probes are `.php`.
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

/** WordPress probe detector as Hono middleware; the root RR boundary
 *  switches to `<NotWordPressView />` via the status text. */
export const honoWpDecoyMiddleware = createMiddleware<Env>(async (c, next) => {
  if (isWordPressDecoyPath(c.req.path)) {
    return c.text(NOT_WORDPRESS_STATUS_TEXT, {
      status: 404,
      statusText: NOT_WORDPRESS_STATUS_TEXT,
    })
  }
  await next()
})
