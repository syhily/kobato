import type { Env } from '@kobato/server/http/context'

import { isCsrfValidationSkipped, isPathExempt, validateCsrfToken, CSRF_HEADER } from '@kobato/server/domains/auth/csrf'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'

// CSRF protects state-changing requests against cookie-carrying browsers —
// the whole premise is that the attacker's forged request rides the
// victim's cookies. Two consequences:
//
//  1. Safe methods (RFC 9110) never mutate, so they pass without a token.
//  2. Requests with NO `Cookie` header at all cannot be a cookie-based CSRF
//     attack, so they pass too. This is what the headless public frontend's
//     SSR reads need: the SDK's RPC wire is POST-based, and the frontend is
//     a separate origin with no core session — it can never hold a core
//     CSRF token, and its transport strips the visitor's frontend-domain
//     cookies (they mean nothing to core). The frontend's own anonymous
//     write procedures stay gated by their own mechanisms (comment-token
//     cookie flow, resource rate limits), and browser-originated requests
//     (which always carry the `__csrf` / `__session` cookies after the
//     first page load) are validated exactly as before. The stage-3 proxy
//     chain additionally exempts frontend-JWT-authenticated requests.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export const csrfGuard = createMiddleware<Env>(async (c, next) => {
  if (
    isCsrfValidationSkipped() ||
    isPathExempt(c.req.path) ||
    SAFE_METHODS.has(c.req.method) ||
    !c.req.header('cookie')
  ) {
    return next()
  }
  const token = c.req.header(CSRF_HEADER)
  if (!validateCsrfToken(c.var.requestContext.session, token)) {
    throw new HTTPException(403, { message: 'Invalid or missing CSRF token' })
  }
  await next()
})
