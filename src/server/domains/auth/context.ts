import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'
import type { LoaderFunctionArgs, RouterContextProvider } from 'react-router'

import { createContext } from 'react-router'

import type { SessionContext } from '@/server/domains/auth/primitives'

export interface RequestContextValue {
  /** Best-effort caller IP, threaded through proxy headers in the middleware. */
  clientAddress: string
  /** Parsed `request.url` (so handlers don't reconstruct it per call). */
  url: URL
}

export interface RouteRequestContext extends SessionContext, RequestContextValue {}

export const sessionContext = createContext<SessionContext>()
export const requestContext = createContext<RequestContextValue>()
export const dbContext = createContext<NodePgDatabase>()
export const poolContext = createContext<Pool>()

export function tryGetSessionContext(context: Readonly<RouterContextProvider> | undefined): SessionContext | undefined {
  if (context === undefined) {
    return undefined
  }
  try {
    return context.get(sessionContext)
  } catch {
    return undefined
  }
}

export function tryGetRequestContext(
  context: Readonly<RouterContextProvider> | undefined,
): RequestContextValue | undefined {
  if (context === undefined) {
    return undefined
  }
  try {
    return context.get(requestContext)
  } catch {
    return undefined
  }
}

type AnyRouteArgs = {
  request: Request
  context: LoaderFunctionArgs['context']
}

export function getRouteRequestContext(args: AnyRouteArgs): RouteRequestContext {
  const context = args.context as Readonly<RouterContextProvider>
  const session = context.get(sessionContext)
  const requestData = context.get(requestContext)
  return {
    session: session.session,
    user: session.user,
    role: session.role,
    clientAddress: requestData.clientAddress,
    url: requestData.url,
  }
}

export function getDbFromContext(args: AnyRouteArgs): NodePgDatabase {
  const context = args.context as Readonly<RouterContextProvider>
  return context.get(dbContext)
}

export function getPoolFromContext(args: AnyRouteArgs): Pool {
  const context = args.context as Readonly<RouterContextProvider>
  return context.get(poolContext)
}
