import type { HandlerContext } from '@kobato/server/http/orpc-base'
import type { Database } from '@kobato/server/infra/db/database'

import { extractRequestFacts } from '@kobato/server/http/utils/request-facts'

// Builders for the `context` argument passed to oRPC procedures
// (via `call(router.method, input, { context })`). Authed procedures
// gate on `context.viewer` via the `requireAuth` / `requireRole`
// middleware in `orpc-base.ts`; this helper seeds both the viewer and
// the session-stub so tests can drive procedures end-to-end.

export interface MockCtxOptions {
  userId?: string
  role?: 'admin' | 'author' | 'visitor'
  sessionId?: string
  clientAddress?: string
  url?: string
  db?: Database
}

function makeSessionStub(user: { id: string; role: string } | undefined, sessionId: string) {
  // Minimal `BlogSession` surface — only the methods orpc-base / the
  // controllers actually call. Cast through `unknown` once at the use
  // site so the typing surface in tests stays clean.
  return {
    id: sessionId,
    get: (key: string) => (key === 'user' ? user : undefined),
    set: () => undefined,
    unset: () => undefined,
    flash: () => undefined,
  } as unknown as HandlerContext['session']
}

export function makeAuthedCtx(opts: MockCtxOptions = {}): HandlerContext {
  const userId = opts.userId ?? '1'
  const role = opts.role ?? 'admin'
  const request = new Request(opts.url ?? 'http://localhost/rpc')
  return {
    request,
    requestFacts: extractRequestFacts(request),
    session: makeSessionStub({ id: userId, role }, opts.sessionId ?? 'session-1'),
    viewer: { id: userId, name: 'Test User', email: 'test@example.com', website: null, role },
    clientAddress: opts.clientAddress ?? '127.0.0.1',
    responseHeaders: new Headers(),
    db: opts.db ?? ({} as Database),
  }
}

export function makePublicCtx(opts: MockCtxOptions = {}): HandlerContext {
  const request = new Request(opts.url ?? 'http://localhost/rpc')
  return {
    request,
    requestFacts: extractRequestFacts(request),
    session: makeSessionStub(undefined, opts.sessionId ?? 'session-1'),
    viewer: null,
    clientAddress: opts.clientAddress ?? '127.0.0.1',
    responseHeaders: new Headers(),
    db: opts.db ?? ({} as Database),
  }
}
