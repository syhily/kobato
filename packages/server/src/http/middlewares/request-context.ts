import type { Env } from '@kobato/server/http/hono-env'
import type { RequestContext } from '@kobato/server/http/request-context'

import { getDb } from '@kobato/server/bootstrap/db-lifecycle'
import {
  buildCsrfCookieHeader,
  CSRF_COOKIE_NAME,
  deriveStatelessCsrfToken,
  ensureCsrfToken,
  isCsrfCookieValue,
  mintCsrfCookieValue,
} from '@kobato/server/domains/auth/csrf'
import { resolveSessionContext } from '@kobato/server/domains/auth/primitives'
import { commitSessionWithMaxAge, SESSION_COOKIE_NAME } from '@kobato/server/domains/auth/session-storage'
import { getClientAddress } from '@kobato/server/http/request/client-address'
import { isExempt as isCookieExemptPath } from '@kobato/server/http/request/cookie-exempt'
import { isPublicReadRpcPath } from '@kobato/server/http/request/public-read-rpc-path'
import { extractRequestFacts, normalizeDocumentUrl } from '@kobato/server/http/request/request-facts'
import { serverConfig } from '@kobato/server/infra/config'
import { parseCookieValue } from '@kobato/server/infra/http/cookie'
import { createLazyAppSnapshot } from '@kobato/settings/app-localization'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
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
  if (typeof socket?.remotePort === 'number') {
    return `port:${socket.remotePort}`
  }
  return undefined
}

export interface DerivedRequest {
  requestContext: RequestContext
  isSessionDirty(): boolean
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export async function deriveRequestContext(input: {
  request: Request
  directRemoteAddress: string | undefined
}): Promise<DerivedRequest> {
  const { request } = input
  const db = getDb()

  let dirty = false
  const sessionCtx = await resolveSessionContext(db, request)
  if (sessionCtx.dirty) {
    dirty = true
  }

  const rawUrl = new URL(request.url)
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

export const requestContextMiddleware = createMiddleware<Env>(async (c, next) => {
  const derived = await deriveRequestContext({
    request: c.req.raw,
    directRemoteAddress: getDirectRemoteAddress(c),
  })
  const { requestContext } = derived

  const cookieHeader = c.req.raw.headers.get('cookie')
  let csrfCookieToSet: string | null = null
  const sessionCookieValue = parseCookieValue(cookieHeader ?? '', SESSION_COOKIE_NAME)
  if (sessionCookieValue) {
    const tokenBefore = requestContext.session.get('csrfToken')
    ensureCsrfToken(requestContext.session)
    if (requestContext.session.get('csrfToken') !== tokenBefore) {
      requestContext.markSessionDirty()
    }
  } else {
    const csrfCookie = parseCookieValue(cookieHeader ?? '', CSRF_COOKIE_NAME)
    if (csrfCookie !== null && isCsrfCookieValue(csrfCookie)) {
      requestContext.session.set('csrfToken', deriveStatelessCsrfToken(csrfCookie))
    } else if ((SAFE_METHODS.has(c.req.method) && !isCookieExemptPath(c.req.path)) || isPublicReadRpcPath(c.req.path)) {
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
    const routeTookOver = c.res.headers.getSetCookie().some((v) => v.startsWith(`${SESSION_COOKIE_NAME}=`))
    if (!routeTookOver) {
      const setCookie = await commitSessionWithMaxAge(requestContext.session)
      c.header('Set-Cookie', setCookie, { append: true })
    }
  }
})
