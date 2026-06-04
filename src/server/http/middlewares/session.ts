import { createMiddleware } from 'hono/factory'

import type { Env } from '@/server/http/context'

import { ensureCsrfToken } from '@/server/domains/auth/csrf'
import { resolveSessionContext } from '@/server/domains/auth/primitives'
import { commitSessionWithMaxAge } from '@/server/domains/auth/session-storage'
import { getClientAddress } from '@/server/http/utils/client-address'

function getDirectRemoteAddress(c: { env: unknown }): string | undefined {
  const env = c.env as Record<string, unknown> | undefined
  const incoming =
    (env?.incoming as Record<string, unknown> | undefined) ??
    (env?.server as Record<string, unknown> | undefined)?.incoming
  const socket = (incoming as Record<string, unknown> | undefined)?.socket as Record<string, unknown> | undefined
  return typeof socket?.remoteAddress === 'string' ? socket.remoteAddress : undefined
}

export const honoSessionMiddleware = createMiddleware<Env>(async (c, next) => {
  const sessionCtx = await resolveSessionContext(c.var.db, c.req.raw)
  c.set('session', sessionCtx.session)
  c.set('sessionDirty', sessionCtx.dirty)
  c.set('viewer', sessionCtx.user ? { userId: sessionCtx.user.id, role: sessionCtx.user.role } : null)
  c.set('clientAddress', getClientAddress(c.req.raw, getDirectRemoteAddress(c)))

  // Ensure every session carries a CSRF token. The token is generated
  // lazily on first access; subsequent requests reuse it. Rotation
  // (if configured) also regenerates the token and timestamp.
  const tokenBefore = sessionCtx.session.get('csrfToken')
  ensureCsrfToken(sessionCtx.session)
  if (sessionCtx.session.get('csrfToken') !== tokenBefore) {
    c.set('sessionDirty', true)
  }

  await next()

  if (c.var.sessionDirty) {
    const setCookie = await commitSessionWithMaxAge(c.var.session)
    c.header('Set-Cookie', setCookie, { append: true })
  }
})

/**
 * Build the two context bags that React Router loaders expect.
 * Returned shape matches the existing `sessionContext` / `requestContext`
 * set by the legacy RR middleware in `src/server/middleware/session.ts`.
 */
export function buildRouteContexts(c: { var: Env['Variables']; req: { raw: Request; url: string } }) {
  const session = c.var.session
  const user = session.get('user')
  return {
    session: { session, user, role: user?.role ?? null },
    request: { clientAddress: c.var.clientAddress, url: new URL(c.req.url) },
  }
}
