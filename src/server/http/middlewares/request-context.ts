import { createMiddleware } from 'hono/factory'

import type { Env } from '@/server/http/context'

import { ensureCsrfToken } from '@/server/domains/auth/csrf'
import { commitSessionWithMaxAge } from '@/server/domains/auth/session-storage'
import { deriveRequestContext } from '@/server/http/request-context'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

function getDirectRemoteAddress(c: { env: unknown }): string | undefined {
  const env = unsafeCast<Record<string, unknown> | undefined>(c.env)
  const incoming =
    unsafeCast<Record<string, unknown> | undefined>(env?.incoming) ??
    unsafeCast<Record<string, unknown> | undefined>(env?.server)?.incoming
  const socket = unsafeCast<Record<string, unknown> | undefined>(
    unsafeCast<Record<string, unknown> | undefined>(incoming)?.socket,
  )
  return typeof socket?.remoteAddress === 'string' ? socket.remoteAddress : undefined
}

/**
 * The single per-request derivation point. Produces the canonical
 * `RequestContext` (see `@/server/http/request-context`) and stores it on
 * `c.var.requestContext`; every downstream surface (oRPC bridge, React
 * Router bridge, resource routers) projects from it — nothing re-derives.
 *
 * Also the single session commit point: same-session mutations mark the
 * context dirty (`markSessionDirty`) and the Set-Cookie goes out here,
 * after the response resolves. Sid-changing flows (login rotation) keep
 * their explicit Set-Cookie channel — see ADR-0003.
 */
export const requestContextMiddleware = createMiddleware<Env>(async (c, next) => {
  const derived = await deriveRequestContext({
    request: c.req.raw,
    directRemoteAddress: getDirectRemoteAddress(c),
  })
  const { requestContext } = derived

  // Ensure every session carries a CSRF token. The token is generated
  // lazily on first access; subsequent requests reuse it. Rotation
  // (if configured) also regenerates the token and timestamp.
  const tokenBefore = requestContext.session.get('csrfToken')
  ensureCsrfToken(requestContext.session)
  if (requestContext.session.get('csrfToken') !== tokenBefore) {
    requestContext.markSessionDirty()
  }

  c.set('requestContext', requestContext)

  await next()

  if (derived.isSessionDirty()) {
    const setCookie = await commitSessionWithMaxAge(requestContext.session)
    c.header('Set-Cookie', setCookie, { append: true })
  }
})
