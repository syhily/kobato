import type { Env } from '@kobato/server/http/hono-env'

import { isCsrfValidationSkipped, isPathExempt, validateCsrfToken, CSRF_HEADER } from '@kobato/server/domains/auth/csrf'
import { localizedHttpException } from '@kobato/server/http/localized-http-exception'
import { isCsrfExemptRpcPath } from '@kobato/server/http/request/csrf-exempt-rpc-path'
import { isPublicReadRpcPath } from '@kobato/server/http/request/public-read-rpc-path'
import { createMiddleware } from 'hono/factory'

export const csrfGuard = createMiddleware<Env>(async (c, next) => {
  if (
    isCsrfValidationSkipped() ||
    isPathExempt(c.req.path) ||
    isPublicReadRpcPath(c.req.path) ||
    isCsrfExemptRpcPath(c.req.path)
  ) {
    return next()
  }
  const token = c.req.header(CSRF_HEADER)
  if (!validateCsrfToken(c.var.requestContext.session, token)) {
    throw localizedHttpException(403, 'error.api.csrfFailed')
  }
  await next()
})
