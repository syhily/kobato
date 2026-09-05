import { createMiddleware } from 'hono/factory'

import type { Env } from '@/server/http/context'

import { resolveVisitorCookie } from '@/server/domains/analytics/visitor-cookie'

const EXEMPT_PATH_PREFIXES = ['/__manifest', '/assets/', '/build/', '/api/', '/sitemap.xml', '/images/']

// Cacheable machine-readable paths never mint anonymous cookies, so shared caches stay clean.
// The feed exemption is the exact `/feed` plus the `/feed/` sub-paths
// (`/feed/atom`): a bare `/feed` prefix would also exempt probes like
// `/feed.xml`, which is NOT a feed route — skipping CSRF minting there made
// the root loader throw instead of 404ing. The cats/tags feed URLs
// (`/cats/:slug/feed`, `/tags/:slug/feed`) never matched the prefix and stay
// non-exempt.
export function isExempt(pathname: string): boolean {
  if (pathname === '/feed' || pathname.startsWith('/feed/')) {
    return true
  }
  return EXEMPT_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export const honoVisitorCookieMiddleware = createMiddleware<Env>(async (c, next) => {
  const url = new URL(c.req.url)
  if (isExempt(url.pathname)) {
    return next()
  }
  const { setCookie } = resolveVisitorCookie(c.req.raw.headers.get('cookie'))
  await next()
  if (setCookie) {
    c.header('Set-Cookie', setCookie, { append: true })
  }
})
