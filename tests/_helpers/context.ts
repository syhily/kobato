import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { RouterContextProvider } from 'react-router'

import type { BlogSession, SessionUser } from '@/server/domains/auth/session-storage'
import type { RequestContext } from '@/server/http/request-context'

import { regularSession } from '#/_helpers/session'
import { requestContext } from '@/server/http/request-context'
import { extractRequestFacts, normalizeDocumentUrl } from '@/server/http/utils/request-facts'

// Stand-in for the `RouterContextProvider` that `buildLoadContext` populates
// in production. Direct loader/action unit tests that bypass the router get
// a context that already has the canonical `RequestContext` pre-loaded so
// the route handler's `getRequestContext(args)` keeps working.
export interface MakeContextOptions {
  request?: Request
  session?: BlogSession
  user?: SessionUser
  clientAddress?: string
  db?: NodePgDatabase
  pool?: Pool
  cspNonce?: string
  markSessionDirty?: () => void
}

export function makeRouteContext({
  request = new Request('http://localhost/'),
  session = regularSession(),
  user,
  clientAddress = '127.0.0.1',
  db,
  pool,
  cspNonce = 'test-csp-nonce',
  markSessionDirty = () => {},
}: MakeContextOptions = {}): RouterContextProvider {
  const context = new RouterContextProvider()
  const resolvedUser = user ?? (session?.data?.user as SessionUser | undefined)
  const canonical: RequestContext = {
    session,
    viewer: resolvedUser ?? null,
    clientAddress,
    url: normalizeDocumentUrl(new URL(request.url)),
    requestFacts: extractRequestFacts(request),
    db: (db ?? {}) as NodePgDatabase,
    pool: (pool ?? {}) as Pool,
    cspNonce,
    markSessionDirty,
  }
  context.set(requestContext, canonical)
  return context
}

// Convenience to match the typical `loader({ request, context, params })`
// signature without callers having to construct the args object themselves.
export function makeLoaderArgs(
  options: MakeContextOptions & { params?: Record<string, string | undefined> } = {},
): any {
  const request = options.request ?? new Request('http://localhost/')
  const context = makeRouteContext({ ...options, request })
  return { request, context, params: options.params ?? {} }
}

/** React Router `data()` wraps the loader payload; unwrap for direct handler tests. */
export function unwrapLoaderData<T>(value: unknown): T {
  if (value !== null && typeof value === 'object' && 'data' in value) {
    return (value as { data: T }).data
  }
  return value as T
}
