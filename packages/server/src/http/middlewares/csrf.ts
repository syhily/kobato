import type { Env } from '@kobato/server/http/context.ts'

import {
  isCsrfValidationSkipped,
  isPathExempt,
  validateCsrfToken,
  CSRF_HEADER,
} from '@kobato/server/domains/auth/csrf.ts'
import { localizedHttpException } from '@kobato/server/http/localized-http-exception.ts'
import { createMiddleware } from 'hono/factory'

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
