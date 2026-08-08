import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'

import type { Env } from '@/server/http/context'

import { hasAtLeast, type Role } from '@/shared/utils/roles'

// RBAC for native Hono resource routes outside the oRPC surface — the oRPC
// procedures gate through `orpc-base.ts`'s requireAuth/requireRole instead.

export const requireRoleMw = (role: Role) =>
  createMiddleware<Env>(async (c, next) => {
    const viewer = c.var.requestContext.viewer
    if (!viewer) {
      throw new HTTPException(401, { message: '未登录' })
    }
    if (!hasAtLeast(viewer.role, role)) {
      throw new HTTPException(403, { message: '权限不足' })
    }
    await next()
  })
