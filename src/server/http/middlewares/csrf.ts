import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'

import type { Env } from '@/server/http/context'

import { isPathExempt, validateCsrfToken, CSRF_HEADER } from '@/server/domains/auth/csrf'

export const csrfGuard = createMiddleware<Env>(async (c, next) => {
  if (isPathExempt(c.req.path)) {
    return next()
  }
  const token = c.req.header(CSRF_HEADER)
  if (!validateCsrfToken(c.var.requestContext.session, token)) {
    throw new HTTPException(403, { message: 'Invalid or missing CSRF token' })
  }
  await next()
})
