import type { HandlerContext } from '@/server/http/orpc-base'
import type { Database } from '@/server/infra/db/database'

import { extractRequestFacts } from '@/server/http/utils/request-facts'

// Builders for the oRPC `context` argument. Authed procedures gate on
// `context.viewer` via requireAuth/requireRole; this seeds both the
// viewer and the session-stub so tests drive procedures end-to-end.

export interface MockCtxOptions {
  userId?: string
  role?: 'admin' | 'author' | 'visitor'
  sessionId?: string
  clientAddress?: string
  url?: string
  /** Raw `Cookie` header — lands in `requestFacts.cookie`. */
  cookie?: string
  /** CSRF token the session stub answers for the `csrfToken` key. */
  csrfToken?: string
  db?: Database
}

function makeSessionStub(user: { id: string; role: string } | undefined, sessionId: string, csrfToken?: string) {
  // Minimal `BlogSession` surface — only the methods orpc-base actually calls.
  return {
    id: sessionId,
    get: (key: string) => {
      if (key === 'user') {
        return user
      }
      if (key === 'csrfToken') {
        return csrfToken
      }
      return undefined
    },
    set: () => undefined,
    unset: () => undefined,
    flash: () => undefined,
  } as unknown as HandlerContext['session']
}

export function makeAuthedCtx(opts: MockCtxOptions = {}): HandlerContext {
  const userId = opts.userId ?? '1'
  const role = opts.role ?? 'admin'
  const request = new Request(
    opts.url ?? 'http://localhost/rpc',
    opts.cookie === undefined ? undefined : { headers: { Cookie: opts.cookie } },
  )
  return {
    request,
    requestFacts: extractRequestFacts(request),
    session: makeSessionStub({ id: userId, role }, opts.sessionId ?? 'session-1', opts.csrfToken),
    viewer: { id: userId, name: 'Test User', email: 'test@example.com', website: null, role },
    clientAddress: opts.clientAddress ?? '127.0.0.1',
    responseHeaders: new Headers(),
    db: opts.db ?? ({} as Database),
  }
}

export function makePublicCtx(opts: MockCtxOptions = {}): HandlerContext {
  const request = new Request(
    opts.url ?? 'http://localhost/rpc',
    opts.cookie === undefined ? undefined : { headers: { Cookie: opts.cookie } },
  )
  return {
    request,
    requestFacts: extractRequestFacts(request),
    session: makeSessionStub(undefined, opts.sessionId ?? 'session-1', opts.csrfToken),
    viewer: null,
    clientAddress: opts.clientAddress ?? '127.0.0.1',
    responseHeaders: new Headers(),
    db: opts.db ?? ({} as Database),
  }
}
