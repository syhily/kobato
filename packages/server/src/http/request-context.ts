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
  readonly settings: BlogSettingsBundle | null
  readonly localization: AppLocalization
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
