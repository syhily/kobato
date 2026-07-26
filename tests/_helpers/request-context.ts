import type { RouterContextProvider } from 'react-router'

import type { MakeContextOptions } from '#/_helpers/context'
import type { RequestContext } from '@/server/http/request-context'

import { makeLoaderArgs } from '#/_helpers/context'
import { requestContext as legacyRequestContext, sessionContext } from '@/server/domains/auth/context'
import { requestContext } from '@/server/http/request-context'
import { extractRequestFacts, normalizeDocumentUrl } from '@/server/http/utils/request-facts'

// Canonical-key companion to `#/_helpers/context`'s `makeLoaderArgs`.
//
// Loaders migrated to `getRequestContext(args)` (ADR-0003) read ONLY the
// canonical `requestContext` key from `@/server/http/request-context`,
// which `makeRouteContext` deliberately does NOT set: importing that
// module pulls in the db bootstrap (`@/server/bootstrap/db-lifecycle`'s
// module-level `initPool()`), and consumers whose mock registry can't
// tolerate it (e.g. partial mocks of the settings hydration service)
// would explode at import time. Only test files whose module graph
// already includes the canonical module (their loaders import it) should
// use this helper.
//
// The stub projects the canonical context FROM the legacy keys
// `makeRouteContext` already set — the exact inverse of production's
// `projectLegacyRouteContexts` — so session / viewer / clientAddress
// stay single-sourced. `url` / `requestFacts` mirror what
// `requestContextMiddleware` derives per request (normalized document
// URL, extracted facts).
export function setCanonicalRequestContext(args: { request: Request; context: RouterContextProvider }): void {
  const { session, user } = args.context.get(sessionContext)
  const { clientAddress } = args.context.get(legacyRequestContext)
  const canonical: RequestContext = {
    session,
    viewer: user ?? null,
    clientAddress,
    url: normalizeDocumentUrl(new URL(args.request.url)),
    requestFacts: extractRequestFacts(args.request),
    db: {} as RequestContext['db'],
    pool: {} as RequestContext['pool'],
    cspNonce: 'test-csp-nonce',
    markSessionDirty: () => {},
  }
  args.context.set(requestContext, canonical)
}

/** `makeLoaderArgs` plus the canonical `requestContext` key — use for loaders that call `getRequestContext`. */
export function makeLoaderArgsWithContext(
  options: MakeContextOptions & { params?: Record<string, string | undefined> } = {},
): any {
  const args = makeLoaderArgs(options)
  setCanonicalRequestContext(args)
  return args
}
