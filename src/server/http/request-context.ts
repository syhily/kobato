import type { LoaderFunctionArgs, RouterContextProvider } from 'react-router'

import { createContext } from 'react-router'

import type { BlogSession, SessionUser } from '@/server/domains/auth/session-storage'
import type { Database } from '@/server/infra/db/database'
import type { RequestFacts } from '@/server/infra/http/request-facts'
import type { BlogSettingsBundle } from '@/shared/config/types'
import type { AppLocalization } from '@/shared/i18n/app-localization'
import type { Role } from '@/shared/utils/roles'

import { requireRole } from '@/server/domains/auth/rbac'

/**
 * The canonical per-request fact base — the CONTRACT module: type, React Router
 * context key, route-side accessors. Derived once by `requestContextMiddleware`.
 */
export interface RequestContext {
  session: BlogSession
  viewer: SessionUser | null
  clientAddress: string
  /** Normalized document URL (never carries `.data` / `_routes` / `index`). */
  url: URL
  requestFacts: RequestFacts
  db: Database
  cspNonce: string
  /**
   * PINNED settings bundle, captured together with `localization` on the first
   * access of either getter then frozen: renderers take their inputs from here so
   * the bytes they produce match the `revision` in the cache key.
   */
  readonly settings: BlogSettingsBundle | null
  /**
   * Resolved from the same pinned snapshot as `settings`.
   *
   * Lazily memoized because this context is derived BEFORE `buildLoadContext`
   * awaits `hydrateBlogSettings`; only loaders/controllers read it, so first
   * access happens after hydration and the snapshot is authoritative.
   */
  readonly localization: AppLocalization
  /**
   * Mark the session mutated — the middleware commits it after the response (the ONLY
   * commit point; sid-changing flows keep their own channel).
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

/**
 * Guard-only loader factory for admin/editor routes whose loader exists solely to gate
 * the route behind a minimum role (data loads client-side via oRPC).
 */
export function guardOnlyLoader(min: Role) {
  return async (args: AnyRouteArgs): Promise<null> => {
    const rc = getRequestContext(args)
    requireRole(rc.viewer ?? undefined, min)
    return null
  }
}
