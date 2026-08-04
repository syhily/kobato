import type { PublicTransport } from '@kobato/sdk/client'

import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { createContext, type RouterContextProvider } from 'react-router'

/**
 * The frontend's per-request fact base — the headless counterpart of the
 * core app's `RequestContext`. The public frontend owns NO session, NO
 * database, NO shared config graph: everything content-shaped arrives over
 * HTTP from core, so the context only carries the core wiring plus the
 * frontend's own per-request bits.
 *
 *   - `coreApiUrl`   — server-side core base URL (`CORE_API_URL`). The SSR
 *     transport targets it; `null` means the frontend is unconfigured and
 *     content loaders fail loudly (misconfiguration is a boot-time concern
 *     surfaced by `/health`).
 *   - `corePublicUrl`— browser-reachable core base URL (`CORE_PUBLIC_URL`).
 *     The browser never calls core in the SSR read path (loaders run on
 *     the frontend server even for client navigations), but the write
 *     proxy chain (stage 3) needs a URL the browser can reach; it rides in
 *     the root loader data so client code can read it without a module-level
 *     `window` touch.
 *   - `cspNonce`     — the frontend's own per-request nonce (there is no
 *     shared session to derive one from). Consumed by the root layout and
 *     `entry.server` for inline scripts / streaming.
 *   - `transport`    — test injection: the in-process transport (the
 *     server package's transitional form, tests-only). Production code
 *     always builds the HTTP fetch transport from `coreApiUrl`.
 */
export interface FrontendRequestContext {
  coreApiUrl: string | null
  corePublicUrl: string | null
  cspNonce: string
  transport?: PublicTransport
}

/** The React Router context key — the single accessor point for loaders. */
export const frontendContext = createContext<FrontendRequestContext>()

type AnyRouteArgs = {
  request: Request
  context: unknown
}

export function getFrontendContext(args: AnyRouteArgs): FrontendRequestContext {
  // React Router 8 (framework mode) always injects the RouterContextProvider;
  // the loader `context` field is `unknown` at the type level.
  const context = unsafeCast<Readonly<RouterContextProvider>>(args.context)
  return context.get(frontendContext)
}
