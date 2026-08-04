import type { HandlerContext } from '@kobato/server/http/orpc-base'
import type { RequestContext } from '@kobato/server/http/request-context'

/**
 * Project an oRPC `HandlerContext` (what the headless procedures see)
 * onto the canonical `RequestContext` shape (what the page loaders
 * read). Lets the Content API procedures reuse the exact page-assembly
 * functions SSR uses — UA/IP/session stay the values the in-process or
 * HTTP transport carried, no re-derivation.
 */
export function handlerContextToRequestContext(hc: HandlerContext): RequestContext {
  return {
    session: hc.session,
    viewer: hc.viewer,
    clientAddress: hc.clientAddress,
    url: new URL(hc.request.url),
    requestFacts: hc.requestFacts,
    db: hc.db,
    cspNonce: '',
    // Read-only Content procedures never mutate the session; the write
    // interactions move to the proxy + JWT model with the split.
    markSessionDirty: () => undefined,
  }
}
