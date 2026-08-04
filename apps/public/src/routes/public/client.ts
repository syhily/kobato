import type { PublicTransport } from '@kobato/sdk/client'

import { createPublicClient } from '@kobato/sdk/client'

import type { FrontendRequestContext } from '@/lib/frontend-context'

/**
 * Injected Content API client for the public routes (headless form).
 *
 * The transport is the HTTP fetch form: every RPC request is forwarded to
 * the core server's `/rpc` mount. The SDK client's wire paths are rooted
 * at the flat `ContentPublicRouter` surface (`/rpc/<procedure>` for the
 * content procedures, `/rpc/comments/<...>` for the public comments
 * router); core's full apiRouter serves the same procedures under the
 * `content.` key — so the transport rewrites `/rpc/<procedure>` to
 * `/rpc/content/<procedure>` and leaves the `comments` prefix untouched.
 * This is the phase-0.6 wire contract, pinned on both sides by the
 * in-process transport's handler shape (`{ ...apiRouter.content, comments }`
 * — see `@/server/http/in-process-transport`) and the headless smoke's
 * anonymous `home` read.
 *
 * Headers the frontend deliberately does NOT forward to core:
 *   - `host` / `connection` / `content-length` — the fetch runtime derives
 *     them from the target URL;
 *   - `cookie` — the visitor's frontend-domain cookies mean nothing to core
 *     (no shared session, no shared origin); the visitor-token proxy chain
 *     (stage 3) carries its own first-party cookie + frontend JWT instead;
 *   - `if-none-match` — the frontend owns the 304 decision (it can only
 *     compute the etag after the payload arrives; forwarding the header
 *     would let core 304 the RPC wire internally and break the envelope).
 *
 * `user-agent` / `accept` / `accept-language` ARE forwarded — the core
 * procedures' request facts (analytics, content negotiation) read them.
 */

// Headers never forwarded to core (lowercased).
const FORWARD_EXCLUDED = new Set(['host', 'connection', 'content-length', 'cookie', 'if-none-match'])

function createCoreHttpTransport(coreApiUrl: string | null): PublicTransport {
  return async (request) => {
    if (coreApiUrl === null || coreApiUrl === '') {
      throw new Error('CORE_API_URL is not configured — the public frontend cannot load content')
    }
    const url = new URL(request.url)
    const targetPath = url.pathname.startsWith('/rpc/comments/')
      ? url.pathname
      : `/rpc/content${url.pathname.slice('/rpc'.length)}`
    const headers = new Headers()
    for (const [name, value] of request.headers) {
      if (!FORWARD_EXCLUDED.has(name.toLowerCase())) {
        headers.set(name, value)
      }
    }
    const init: RequestInit = { method: request.method, headers }
    // Buffer the RPC envelope and send it as a string: RPC payloads are
    // small JSON, and a concrete `content-length` both keeps core's
    // dynamic-body-limit on its cheap content-length path (a chunked
    // stream would force it to re-wrap the body — a `new Request` on the
    // incoming raw request that crashes in the vite dev-server realm,
    // where the request object is not undici's) and is generally friendlier
    // to intermediate proxies.
    if (request.body !== null) {
      init.body = await request.text()
    }
    return fetch(`${coreApiUrl.replace(/\/+$/, '')}${targetPath}${url.search}`, init)
  }
}

export function getPublicClient(ctx: FrontendRequestContext) {
  return createPublicClient(ctx.transport ?? createCoreHttpTransport(ctx.coreApiUrl))
}

/** Named export for the transport's own unit test (`tests/unit/routes/public/client.test.ts`). */
export { createCoreHttpTransport }
