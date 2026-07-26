import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'
import type { LoaderFunctionArgs, RouterContextProvider } from 'react-router'

import { createContext } from 'react-router'

import type { BlogSession, SessionUser } from '@/server/domains/auth/session-storage'
import type { RequestFacts } from '@/server/infra/http/request-facts'

/**
 * The canonical per-request fact base — the lightweight CONTRACT module:
 * the type, the React Router context key, and the route-side accessor.
 * Derivation lives in `@/server/http/middlewares/request-context` (which
 * pulls the db/session/infra graph); this module deliberately imports
 * nothing at runtime beyond `react-router` so route modules and test
 * helpers can import the key without dragging the server graph in.
 *
 * Derived exactly once per request by `requestContextMiddleware` and
 * projected onto the three context surfaces:
 *
 *  - Hono:      `c.var.requestContext` (the only var besides `requestId`)
 *  - oRPC:      `HandlerContext` — explicit field copy + `responseHeaders`,
 *               deliberately WITHOUT `markSessionDirty` (read-only session)
 *  - React Router: the `requestContext` key below on the
 *               `RouterContextProvider`
 *
 * Rules the derivation owns so no consumer re-derives them:
 *  - proxy-aware client address (`clientAddress`)
 *  - session → identity projection (`viewer` IS the `SessionUser`)
 *  - URL normalization (`url` is the document URL — `.data` stripped)
 *  - per-request db/pool handles (pool recreation stays visible)
 *  - the single CSP nonce
 *  - session dirty tracking (`markSessionDirty` → one commit at the seam)
 */
export interface RequestContext {
  session: BlogSession
  /** The session's identity projection. `null` for anonymous requests. */
  viewer: SessionUser | null
  clientAddress: string
  /** Normalized document URL (never carries `.data` / `_routes` / `index`). */
  url: URL
  requestFacts: RequestFacts
  db: NodePgDatabase
  pool: Pool
  cspNonce: string
  /**
   * Mark the session as mutated. The perimeter middleware commits it
   * (Set-Cookie) after the response resolves — the ONLY commit point for
   * same-session mutations. Sid-changing flows (login rotation) keep
   * their explicit Set-Cookie channel; see ADR-0003.
   */
  markSessionDirty(): void
}

// ─── React Router projection ────────────────────────────
// The RR-side accessor for the canonical context — the single key every
// loader/action reads via `getRequestContext`.

export const requestContext = createContext<RequestContext>()

type AnyRouteArgs = {
  request: Request
  context: LoaderFunctionArgs['context']
}

export function getRequestContext(args: AnyRouteArgs): RequestContext {
  const context = args.context as Readonly<RouterContextProvider>
  return context.get(requestContext)
}
