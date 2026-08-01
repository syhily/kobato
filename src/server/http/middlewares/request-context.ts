import { createMiddleware } from 'hono/factory'
import { randomBytes } from 'node:crypto'

import type { Env } from '@/server/http/context'
import type { RequestContext } from '@/server/http/request-context'

import { getDb } from '@/server/bootstrap/db-lifecycle'
import {
  buildCsrfCookieHeader,
  CSRF_COOKIE_NAME,
  deriveStatelessCsrfToken,
  ensureCsrfToken,
  isCsrfCookieValue,
  mintCsrfCookieValue,
} from '@/server/domains/auth/csrf'
import { resolveSessionContext } from '@/server/domains/auth/primitives'
import { commitSessionWithMaxAge, SESSION_COOKIE_NAME } from '@/server/domains/auth/session-storage'
import { isExempt as isCookieExemptPath } from '@/server/http/middlewares/visitor-cookie'
import { getClientAddress } from '@/server/http/utils/client-address'
import { extractRequestFacts, normalizeDocumentUrl } from '@/server/http/utils/request-facts'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

function getDirectRemoteAddress(c: { env: unknown }): string | undefined {
  const env = unsafeCast<Record<string, unknown> | undefined>(c.env)
  const incoming =
    unsafeCast<Record<string, unknown> | undefined>(env?.incoming) ??
    unsafeCast<Record<string, unknown> | undefined>(env?.server)?.incoming
  const socket = unsafeCast<Record<string, unknown> | undefined>(
    unsafeCast<Record<string, unknown> | undefined>(incoming)?.socket,
  )
  if (typeof socket?.remoteAddress === 'string') {
    return socket.remoteAddress
  }
  // node-server can report an undefined remoteAddress (e.g. behind a TCP
  // reverse proxy) while remotePort is still known. Keying on `port:<n>`
  // keeps rate-limit buckets per connection instead of collapsing every
  // such peer into one shared 'unknown' bucket (V3-09). Unix sockets
  // expose neither and keep the 'unknown' fallback in `getClientAddress`.
  if (typeof socket?.remotePort === 'number') {
    return `port:${socket.remotePort}`
  }
  return undefined
}

export interface DerivedRequest {
  requestContext: RequestContext
  /** Middleware-only reader for the dirty flag behind `markSessionDirty`. */
  isSessionDirty(): boolean
}

function readCookieValue(header: string | null, name: string): string | null {
  if (!header) {
    return null
  }
  const m = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
  return m ? decodeURIComponent(m[1]!) : null
}

// Only safe methods (RFC 7231) may mint the anonymous `__csrf` cookie;
// an unsafe anonymous request without it simply carries no token and the
// CSRF guard rejects it — same as a bot POSTing without a token today.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Derive the canonical `RequestContext`. Called once per request by the
 * middleware; `directRemoteAddress` is the raw socket peer (Hono-specific
 * `c.env` dig, so it stays on the middleware side of the seam).
 */
export async function deriveRequestContext(input: {
  request: Request
  directRemoteAddress: string | undefined
}): Promise<DerivedRequest> {
  const { request } = input
  // Per-request resolution keeps database reopen (backup restore) visible.
  const db = getDb()

  let dirty = false
  const sessionCtx = await resolveSessionContext(db, request)
  if (sessionCtx.dirty) {
    dirty = true
  }

  const rawUrl = new URL(request.url)
  const requestContext: RequestContext = {
    session: sessionCtx.session,
    viewer: sessionCtx.user ?? null,
    clientAddress: getClientAddress(request, input.directRemoteAddress),
    url: normalizeDocumentUrl(rawUrl),
    requestFacts: extractRequestFacts(request),
    db,
    cspNonce: randomBytes(16).toString('base64'),
    markSessionDirty() {
      dirty = true
    },
  }
  return { requestContext, isSessionDirty: () => dirty }
}

/**
 * The single per-request derivation point. Produces the canonical
 * `RequestContext` (see `@/server/http/request-context`) and stores it on
 * `c.var.requestContext`; every downstream surface (oRPC bridge, React
 * Router bridge, resource routers) projects from it — nothing re-derives.
 *
 * Also the single session commit point: same-session mutations mark the
 * context dirty (`markSessionDirty`) and the Set-Cookie goes out here,
 * after the response resolves — unless the route already set a
 * `__session` cookie itself, in which case the route's header wins and
 * the dirty commit is skipped. Sid-changing flows (login rotation,
 * logout) keep their explicit Set-Cookie channel — see ADR-0003.
 */
export const requestContextMiddleware = createMiddleware<Env>(async (c, next) => {
  const derived = await deriveRequestContext({
    request: c.req.raw,
    directRemoteAddress: getDirectRemoteAddress(c),
  })
  const { requestContext } = derived

  // CSRF token resolution. Requests carrying the signed session cookie
  // keep the persisted-token contract unchanged: the token lives in the
  // session row, and minting one marks the context dirty so the commit
  // below rewrites the row. Cookieless anonymous requests never persist a
  // session just to carry a token — a bot flood would otherwise write one
  // session row per GET (P1-4). Their token is derived statelessly from
  // the HttpOnly `__csrf` cookie (see `@/server/domains/auth/csrf`) and
  // parked in the in-memory session, so loaders and the CSRF guard read
  // it exactly as before while nothing here marks the context dirty.
  const cookieHeader = c.req.raw.headers.get('cookie')
  let csrfCookieToSet: string | null = null
  if (readCookieValue(cookieHeader, SESSION_COOKIE_NAME) !== null) {
    // Ensure every session carries a CSRF token. The token is generated
    // lazily on first access; subsequent requests reuse it.
    const tokenBefore = requestContext.session.get('csrfToken')
    ensureCsrfToken(requestContext.session)
    if (requestContext.session.get('csrfToken') !== tokenBefore) {
      requestContext.markSessionDirty()
    }
  } else {
    const csrfCookie = readCookieValue(cookieHeader, CSRF_COOKIE_NAME)
    if (csrfCookie !== null && isCsrfCookieValue(csrfCookie)) {
      requestContext.session.set('csrfToken', deriveStatelessCsrfToken(csrfCookie))
    } else if (SAFE_METHODS.has(c.req.method) && !isCookieExemptPath(c.req.path)) {
      const fresh = mintCsrfCookieValue()
      requestContext.session.set('csrfToken', deriveStatelessCsrfToken(fresh))
      csrfCookieToSet = buildCsrfCookieHeader(fresh)
    }
  }

  c.set('requestContext', requestContext)

  await next()

  if (csrfCookieToSet !== null) {
    c.header('Set-Cookie', csrfCookieToSet, { append: true })
  }

  if (derived.isSessionDirty()) {
    // A route that sets the session cookie itself (login rotation, logout
    // destroy, the OTP/setup explicit commits) owns the cookie channel for
    // this response. Appending a second `__session` commit here would land
    // LAST (browsers apply Set-Cookie in order) and override the route's
    // header — for destroy/rotation flows that means resurrecting the very
    // session row the route just deleted and keeping the old sid alive.
    const routeTookOver = c.res.headers.getSetCookie().some((v) => v.startsWith(`${SESSION_COOKIE_NAME}=`))
    if (!routeTookOver) {
      const setCookie = await commitSessionWithMaxAge(requestContext.session)
      c.header('Set-Cookie', setCookie, { append: true })
    }
  }
})
