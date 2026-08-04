import type { HandlerContext } from '@kobato/server/http/orpc-base'
import type { RequestContext } from '@kobato/server/http/request-context'

import { apiRouter } from '@kobato/server/http/api-router'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { RPCHandler } from '@orpc/server/fetch'

// The public client is typed as the content surface (+ public comments),
// so the RPC wire paths are relative to that root (`home`, `comments.list`
// — not `content.home`). Match the handler to the same shape.
const handler = new RPCHandler({
  ...apiRouter.content,
  comments: apiRouter.comments,
})

/**
 * In-process transport for the Content API client — the transitional
 * (single-package) and test-only form. Runs the request through the
 * same `RPCHandler` the HTTP bridge uses, projecting the current
 * request's `RequestContext` as the handler context so UA/IP/session
 * stay bit-faithful (no loopback HTTP, no header fabrication).
 *
 * Lifecycle: lives only until the package split — after the split the
 * public frontend uses the HTTP fetch transport (see
 * `src/client/api/public-client.ts`); the in-process form survives as
 * the test injection only.
 */
export function createInProcessTransport(rc: RequestContext): (request: Request) => Promise<Response> {
  return async (request) => {
    const context: HandlerContext = {
      request,
      requestFacts: rc.requestFacts,
      session: rc.session,
      viewer: rc.viewer,
      clientAddress: rc.clientAddress,
      // Read-only Content procedures do not write response headers in
      // this phase; write interactions switch to the proxy + JWT model
      // together with the split (phase 1), where the HTTP transport
      // carries them back natively.
      responseHeaders: new Headers(),
      db: rc.db,
    }
    // Mirror the HTTP transport's header policy (see
    // `apps/public/src/routes/public/client.ts`): the frontend owns the
    // 304 decision, so `If-None-Match` is stripped before the handler runs
    // — core's page preview would otherwise 304 the RPC wire internally
    // and break the envelope. The test form must behave exactly like the
    // production HTTP form.
    const forwarded = new Headers(request.headers)
    forwarded.delete('if-none-match')
    const init: RequestInit = { method: request.method, headers: forwarded }
    if (request.body !== null) {
      // The RPC wire carries the input as a stream body — `new Request`
      // (undici) requires the explicit `duplex` hint for stream bodies.
      // The DOM `RequestInit` type has no `duplex` field (undici-only).
      init.body = request.body
      // The DOM `RequestInit` type has no `duplex` field (undici-only).
      unsafeCast<RequestInit & { duplex: 'half' }>(init).duplex = 'half'
    }
    const result = await handler.handle(new Request(request.url, init), { prefix: '/rpc', context })
    if (!result.matched) {
      return new Response('Not Found', { status: 404 })
    }
    return result.response
  }
}
