import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'
import type { LoaderFunctionArgs, RouterContextProvider } from 'react-router'

import { randomBytes } from 'node:crypto'
import { createContext } from 'react-router'

import type { RequestContextValue } from '@/server/domains/auth/context'
import type { SessionContext } from '@/server/domains/auth/primitives'
import type { BlogSession, SessionUser } from '@/server/domains/auth/session-storage'
import type { RequestFacts } from '@/server/infra/http/request-facts'

import { getDb, getPool } from '@/server/bootstrap/db-lifecycle'
import { resolveSessionContext } from '@/server/domains/auth/primitives'
import { getClientAddress } from '@/server/http/utils/client-address'
import { extractRequestFacts, normalizeDocumentUrl } from '@/server/http/utils/request-facts'

/**
 * The canonical per-request fact base. Derived exactly once per request by
 * `requestContextMiddleware` (`@/server/http/middlewares/request-context`)
 * and projected onto the three context surfaces:
 *
 *  - Hono:      `c.var.requestContext` (the only var besides `requestId`)
 *  - oRPC:      `HandlerContext` — explicit field copy + `responseHeaders`,
 *               deliberately WITHOUT `markSessionDirty` (read-only session)
 *  - React Router: the `requestContext` key below on the
 *               `RouterContextProvider`
 *
 * Rules this module owns so no consumer re-derives them:
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

export interface DerivedRequest {
  requestContext: RequestContext
  /** Middleware-only reader for the dirty flag behind `markSessionDirty`. */
  isSessionDirty(): boolean
}

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
  // Per-request resolution keeps pool recreation (backup restore) visible.
  const db = getDb()
  const pool = getPool()

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
    pool,
    cspNonce: randomBytes(16).toString('base64'),
    markSessionDirty() {
      dirty = true
    },
  }
  return { requestContext, isSessionDirty: () => dirty }
}

// ─── React Router projection ────────────────────────────
// The RR-side accessor for the canonical context. Stage ③ migrates
// loaders to `getRequestContext` and deletes the legacy five-key split
// in `@/server/domains/auth/context`.

export const requestContext = createContext<RequestContext>()

type AnyRouteArgs = {
  request: Request
  context: LoaderFunctionArgs['context']
}

export function getRequestContext(args: AnyRouteArgs): RequestContext {
  const context = args.context as Readonly<RouterContextProvider>
  return context.get(requestContext)
}

/**
 * Legacy five-key projection, consumed by `buildLoadContext` until the
 * RR migration (stage ③) deletes the old keys. Pure projection — every
 * value comes from the canonical context, nothing is re-derived.
 */
export function projectLegacyRouteContexts(rc: RequestContext): {
  session: SessionContext
  request: RequestContextValue
} {
  return {
    session: { session: rc.session, user: rc.viewer ?? undefined, role: rc.viewer?.role ?? null },
    request: { clientAddress: rc.clientAddress, url: rc.url },
  }
}
