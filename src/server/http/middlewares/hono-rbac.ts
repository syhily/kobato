import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'

import type { Env } from '@/server/http/context'

import { hasAtLeast, type Role } from '@/shared/utils/roles'

// Hono-side RBAC middleware for the resource routers
// (`server/http/resources/`: analytics SSE, admin uploads, backup,
// branding, music proxy, maxmind) that live OUTSIDE the oRPC surface.
// The oRPC procedures themselves go through the
// `requireAuth / requireRole` middleware in `src/server/http/orpc-base.ts`
// — this middleware exists only for native Hono routes that bypass the
// RPCHandler bridge.

export const requireRoleMw = (role: Role) =>
  createMiddleware<Env>(async (c, next) => {
    const user = c.var.session.get('user')
    if (!user) {
      throw new HTTPException(401, { message: '未登录' })
    }
    if (!hasAtLeast(user.role, role)) {
      throw new HTTPException(403, { message: '权限不足' })
    }
    c.set('viewer', { userId: user.id, role: user.role })
    await next()
  })
