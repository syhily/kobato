import { createMiddleware } from 'hono/factory'

import type { Env } from '@/server/http/context'

import { isCsrfValidationSkipped, isPathExempt, validateCsrfToken, CSRF_HEADER } from '@/server/domains/auth/csrf'
import { localizedHttpException } from '@/server/http/localized-http-exception'

export const csrfGuard = createMiddleware<Env>(async (c, next) => {
  if (isCsrfValidationSkipped() || isPathExempt(c.req.path)) {
    return next()
  }
  const token = c.req.header(CSRF_HEADER)
  if (!validateCsrfToken(c.var.requestContext.session, token)) {
    throw localizedHttpException(403, 'error.api.csrfFailed')
  }
  await next()
})
