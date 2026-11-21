import type { Role } from '@kobato/auth/roles'
import type { Database } from '@kobato/db/database'
import type { BlogSession, SessionUser } from '@kobato/server/domains/auth/session-storage'
import type { RequestFacts } from '@kobato/server/infra/http/request-facts'
import type { AppLocalization } from '@kobato/settings/app-localization'
import type { BlogSettingsBundle } from '@kobato/settings/types'
import type { LoaderFunctionArgs, RouterContextProvider } from 'react-router'

import { requireRole } from '@kobato/server/domains/auth/rbac'
import { createContext } from 'react-router'

export interface RequestContext {
  session: BlogSession
  viewer: SessionUser | null
  clientAddress: string
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

export function guardOnlyLoader(min: Role) {
  return async (args: AnyRouteArgs): Promise<null> => {
    const rc = getRequestContext(args)
    requireRole(rc.viewer ?? undefined, min)
    return null
  }
}
