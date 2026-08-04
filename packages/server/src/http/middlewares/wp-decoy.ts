import type { Env } from '@kobato/server/http/context'

import { createMiddleware } from 'hono/factory'

// WordPress probe detector. The site borrows the WordPress URL shape for
// its real admin (`/admin/signin`, `/admin`, the install route
// `/admin/setup`, plus the SPA sub-routes mounted under `/admin/*`);
// every other request that *looks* like a WordPress install is almost
// certainly an automated scanner. We answer those with a HTTP 404 plus
// a custom "this is not a WordPress site" view rather than the generic
// 404.
//
// The marker (`statusText: "Not WordPress"`) is what `src/root.tsx`
// `ErrorBoundary` reads to switch from the regular 404 view to
// `<NotWordPressView />`.

const LEGIT_WP_PATHS = new Set(['/admin/signin', '/admin', '/admin/', '/admin/setup'])

export function isWordPressDecoyPath(pathname: string): boolean {
  if (LEGIT_WP_PATHS.has(pathname)) {
    return false
  }

  // No `/admin/*` blanket rule: the real SPA shell serves clean
  // extension-less paths there, and the WP probes under that prefix are
  // all `.php` entry points — already caught by the rule below.
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

/**
 * WordPress probe detector mounted as Hono middleware.
 *
 * Previously lived in RR loaders (`page.detail` + `not-found`) so the
 * error boundary would render inside `<BaseLayout>`. After the Hono
 * migration the 404 response is returned directly by the HTTP layer;
 * the root React Router boundary still catches it and switches to
 * `<NotWordPressView />` via `statusText === 'Not WordPress'`.
 */
export const honoWpDecoyMiddleware = createMiddleware<Env>(async (c, next) => {
  if (isWordPressDecoyPath(c.req.path)) {
    return c.text(NOT_WORDPRESS_STATUS_TEXT, {
      status: 404,
      statusText: NOT_WORDPRESS_STATUS_TEXT,
    })
  }
  await next()
})
