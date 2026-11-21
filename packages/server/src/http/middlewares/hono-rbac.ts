import type { Env } from '@kobato/server/http/hono-env'

import { hasAtLeast, type Role } from '@kobato/auth/roles'
import { localizedHttpException } from '@kobato/server/http/localized-http-exception'
import { createMiddleware } from 'hono/factory'

export const requireRoleMw = (role: Role) =>
  createMiddleware<Env>(async (c, next) => {
    const viewer = c.var.requestContext.viewer
    if (!viewer) {
      throw localizedHttpException(401, 'error.api.unauthorized')
    }
    if (!hasAtLeast(viewer.role, role)) {
      throw localizedHttpException(403, 'error.api.insufficientPermissions')
    }
    await next()
  })
