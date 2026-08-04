import type { Env } from '@kobato/server/http/context'

import { resolveVisitorCookie } from '@kobato/server/domains/analytics/visitor-cookie'
import { createMiddleware } from 'hono/factory'

const EXEMPT_PATH_PREFIXES = ['/__manifest', '/assets/', '/build/', '/api/', '/feed', '/sitemap.xml', '/images/']

// Paths serving cacheable machine-readable resources rather than HTML
// documents — anonymous cookies (visitor id, the stateless CSRF cookie)
// are never minted on them so shared caches can keep serving them.
export function isExempt(pathname: string): boolean {
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
