import { createMiddleware } from 'hono/factory'

import type { Env } from '@/server/http/context'

import { localizedHttpException } from '@/server/http/localized-http-exception'
import { hasAtLeast, type Role } from '@/shared/utils/roles'

// RBAC for native Hono resource routes outside the oRPC surface; oRPC gates through
// `orpc-base.ts`'s requireAuth/requireRole instead.

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
