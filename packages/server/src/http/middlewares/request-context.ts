import type { Env } from '@kobato/server/http/hono-env.ts'
import type { RequestContext } from '@kobato/server/http/request-context.ts'

import { getDb } from '@kobato/server/bootstrap/db-lifecycle.ts'
import {
  buildCsrfCookieHeader,
  CSRF_COOKIE_NAME,
  deriveStatelessCsrfToken,
  ensureCsrfToken,
  isCsrfCookieValue,
  mintCsrfCookieValue,
} from '@kobato/server/domains/auth/csrf.ts'
import { resolveSessionContext } from '@kobato/server/domains/auth/primitives.ts'
import { commitSessionWithMaxAge, SESSION_COOKIE_NAME } from '@kobato/server/domains/auth/session-storage.ts'
import { getClientAddress } from '@kobato/server/http/utils/client-address.ts'
import { isExempt as isCookieExemptPath } from '@kobato/server/http/utils/cookie-exempt.ts'
import { extractRequestFacts, normalizeDocumentUrl } from '@kobato/server/http/utils/request-facts.ts'
import { serverConfig } from '@kobato/server/infra/config.ts'
import { createLazyAppSnapshot } from '@kobato/settings/app-localization.ts'
import { unsafeCast } from '@kobato/utils/unsafe-cast.ts'
import { createMiddleware } from 'hono/factory'
import { randomBytes } from 'node:crypto'

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
  // node-server can report undefined remoteAddress (e.g. behind a TCP reverse proxy);
  // keying on `port:<n>` keeps rate-limit buckets per connection.
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
  const m = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(header)
  if (!m) {
    return null
  }
  try {
    return decodeURIComponent(m[1]!)
  } catch {
    // A malformed percent-escape must not 500 the request — the cookie
    // counts as absent (a session cookie then simply misses).
    return null
  }
}

// Only safe methods mint the anonymous `__csrf` cookie — unsafe anonymous
// requests carry none and the CSRF guard rejects them.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Derive the canonical `RequestContext` once per request; `directRemoteAddress` is the raw socket peer. */
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
  // Lazy + memoized: hydration happens after this context exists (in `buildLoadContext`
  // and the `/rpc/*` bridge), and ONE capture pins bundle + localization + revision
  // together, so a save mid-request cannot split rendered bytes from their cache key.
  const appSnapshot = createLazyAppSnapshot()
  const requestContext: RequestContext = {
    session: sessionCtx.session,
    viewer: sessionCtx.user ?? null,
    clientAddress: getClientAddress(request, input.directRemoteAddress, serverConfig.security.trustedProxies),
    url: normalizeDocumentUrl(rawUrl),
    requestFacts: extractRequestFacts(request),
    db,
    cspNonce: randomBytes(16).toString('base64'),
    get settings() {
      return appSnapshot().settings
    },
    get localization() {
      return appSnapshot().localization
    },
    markSessionDirty() {
      dirty = true
    },
  }
  return { requestContext, isSessionDirty: () => dirty }
}

/**
 * Single per-request derivation point and session commit point: the Set-Cookie goes out
 * after the response unless the route already set `__session`.
 */
export const requestContextMiddleware = createMiddleware<Env>(async (c, next) => {
  const derived = await deriveRequestContext({
    request: c.req.raw,
    directRemoteAddress: getDirectRemoteAddress(c),
  })
  const { requestContext } = derived

  // Session bearers keep the persisted-token contract; anonymous requests derive a
  // stateless token from the `__csrf` cookie — no session row per GET.
  const cookieHeader = c.req.raw.headers.get('cookie')
  let csrfCookieToSet: string | null = null
  if (readCookieValue(cookieHeader, SESSION_COOKIE_NAME) !== null) {
    // Token is minted lazily on first access; subsequent requests reuse it.
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
    // A route-set `__session` cookie wins: Set-Cookie applies in order, so appending the
    // commit would resurrect a session the route destroyed.
    const routeTookOver = c.res.headers.getSetCookie().some((v) => v.startsWith(`${SESSION_COOKIE_NAME}=`))
    if (!routeTookOver) {
      const setCookie = await commitSessionWithMaxAge(requestContext.session)
      c.header('Set-Cookie', setCookie, { append: true })
    }
  }
})
