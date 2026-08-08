import type { LoaderFunctionArgs, RouterContextProvider } from 'react-router'

import { createContext } from 'react-router'

import type { BlogSession, SessionUser } from '@/server/domains/auth/session-storage'
import type { Database } from '@/server/infra/db/database'
import type { RequestFacts } from '@/server/infra/http/request-facts'

/**
 * The canonical per-request fact base — the CONTRACT module: type, React
 * Router context key, route-side accessor. Imports nothing at runtime
 * beyond `react-router`; derived once by `requestContextMiddleware`.
 */
export interface RequestContext {
  session: BlogSession
  /** The session's identity projection. `null` for anonymous requests. */
  viewer: SessionUser | null
  clientAddress: string
  /** Normalized document URL (never carries `.data` / `_routes` / `index`). */
  url: URL
  requestFacts: RequestFacts
  db: Database
  cspNonce: string
  /**
   * Mark the session mutated — the middleware commits it after the response
   * (the ONLY commit point; sid-changing flows keep their own channel, ADR-0003).
   */
  markSessionDirty(): void
}

export const requestContext = createContext<RequestContext>()

type AnyRouteArgs = {
  request: Request
  context: LoaderFunctionArgs['context']
}

export function getRequestContext(args: AnyRouteArgs): RequestContext {
  const context = args.context as Readonly<RouterContextProvider>
  return context.get(requestContext)
}
