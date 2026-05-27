import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { RouterContextProvider } from 'react-router'

import type { BlogSession, SessionUser } from '@/server/domains/auth/session-storage'

import { dbContext, poolContext, requestContext, sessionContext } from '@/server/domains/auth/context'

import { regularSession } from './session'

// Stand-in for the `RouterContextProvider` that `sessionMiddleware` populates
// in production. Direct loader/action unit tests that bypass the router get
// a context that already has the session + request facts pre-loaded so the
// route handler's `context.get(sessionContext)` keeps working.
export interface MakeContextOptions {
  request?: Request
  session?: BlogSession
  user?: SessionUser
  clientAddress?: string
}

export function makeRouteContext({
  request = new Request('http://localhost/'),
  session = regularSession(),
  user,
  clientAddress = '127.0.0.1',
}: MakeContextOptions = {}): RouterContextProvider {
  const context = new RouterContextProvider()
  const resolvedUser = user ?? (session?.data?.user as SessionUser | undefined)
  context.set(sessionContext, {
    session,
    user: resolvedUser,
    role: resolvedUser?.role ?? null,
  })
  context.set(requestContext, {
    clientAddress,
    url: new URL(request.url),
  })
  context.set(dbContext, {} as NodePgDatabase)
  context.set(poolContext, {} as Pool)
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
