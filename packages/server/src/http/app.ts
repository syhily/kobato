import type { Env } from '@kobato/server/http/context'
import type { HandlerContext } from '@kobato/server/http/orpc-base'
import type { StatusCode } from 'hono/utils/http-status'

import { apiRouter } from '@kobato/server/http/api-router'
import { apiFaceMiddleware } from '@kobato/server/http/middlewares/api-face'
import { csrfGuard } from '@kobato/server/http/middlewares/csrf'
import { dynamicBodyLimit } from '@kobato/server/http/middlewares/dynamic-body-limit'
import { getBlogSettingsBundleSync } from '@kobato/shared/config/getters'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { OpenAPIGenerator } from '@orpc/openapi'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { RPCHandler } from '@orpc/server/fetch'
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4'
import { Hono } from 'hono'

// ─── oRPC + Hono perimeter ──────────────────────────────
//
// Single mount point for the whole API. `RPCHandler` consumes the
// composed `apiRouter` and answers every request whose path matches
// `/rpc/*`. The Hono wrapper adds the perimeter around it:
//
//   1. `bodyLimit` — read from `blog.limits` settings (default 10 MB).
//      Checked per-request from the live settings snapshot so admin
//      changes take effect immediately without a server restart.
//   2. `csrfGuard` on `/rpc/*`.
//   3. Context projection — `c.var.requestContext` is the canonical
//      per-request fact base derived by the request-context middleware;
//      the bridge projects it into `HandlerContext` and adds
//      `responseHeaders`, a fresh `Headers` object that procedures
//      can append to (Set-Cookie etc.) and we merge onto the final
//      Response after the handler resolves.
//
// The permission matrix is no longer an `app.ts` block — each leaf's
// guard is encoded in which base procedure (`publicProc / authedProc /
// adminProc / authorProc` in `orpc-base.ts`) the controller built it
// from. Audit surface: `grep -rn "adminProc\|authorProc"
// src/server/http/controllers/`.

const handler = new RPCHandler(apiRouter)

// Headless Content API over REST (phase 0.6): the same procedures the
// frontend consumes over `/rpc` are served with an OpenAPI-shaped wire
// at `/api/**` for third-party frontends. The router shape matches the
// public client (`content` + public `comments`), and the procedure route
// paths carry the `/content/v1` version prefix.
/** The headless Content API surface — content + public comments + the
 *  write interactions third-party frontends proxy (likes, newsletter
 *  subscribe, friend-link applications). Shared by the REST handler,
 *  the spec generator, and the equivalence tests. */
export const contentSurface = {
  ...apiRouter.content,
  comments: apiRouter.comments,
  likes: apiRouter.likes,
  newsletter: apiRouter.newsletter,
  friends: apiRouter.friends,
} as const

const openApiHandler = new OpenAPIHandler(contentSurface)

// The OpenAPI document is generated once from the router types — no
// hand-written second contract. Refreshed per process start; a future
// admin action can invalidate it. `schemaConverters` is REQUIRED: without
// it the generator cannot convert the zod input/output schemas and every
// operation degrades to `any` (no parameters, no requestBody, no
// response schemas).
let openApiSpecPromise: Promise<Record<string, unknown>> | null = null
function getOpenApiSpec(): Promise<Record<string, unknown>> {
  if (openApiSpecPromise === null) {
    const generator = new OpenAPIGenerator({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    })
    openApiSpecPromise = generator.generate(contentSurface, {
      info: { title: 'Kobato Content API', version: '1' },
    }) as Promise<Record<string, unknown>>
  }
  return openApiSpecPromise
}

const DEFAULT_MAX_BODY_SIZE = 10 * 1024 * 1024 // 10 MB

function resolveMaxBodySize(): number {
  const bundle = getBlogSettingsBundleSync()
  const configured = bundle?.limits?.maxRequestBodySize
  return typeof configured === 'number' && configured > 0 ? configured : DEFAULT_MAX_BODY_SIZE
}

export function createApiApp(): Hono<Env> {
  const app = new Hono<Env>()

  // Per-request body size check. Reads the live settings snapshot every
  // time (a single pointer load — negligible cost) so an admin change to
  // `maxRequestBodySize` takes effect on the very next request.
  app.use(
    dynamicBodyLimit({
      maxSize: resolveMaxBodySize,
      onError: (c) => c.json({ error: { message: '请求体过大' } }, 413),
    }),
  )

  // REST face: OpenAPI-shaped responses under `/api/**`. Anonymous reads
  // are open; the spec endpoint serves the generated document.
  //
  // Registration order matters: `apiFaceMiddleware` (CORS + read rate
  // limit) must run BEFORE the OpenAPI handler — the handler answers
  // matched routes directly, so anything registered after it would never
  // see them.
  app.use('/api/*', apiFaceMiddleware())

  app.use('/api/*', async (c, next) => {
    const rc = c.var.requestContext
    const context: HandlerContext = {
      request: c.req.raw,
      requestFacts: rc.requestFacts,
      session: rc.session,
      viewer: rc.viewer,
      clientAddress: rc.clientAddress,
      responseHeaders: new Headers(),
      db: rc.db,
    }
    const result = await openApiHandler.handle(c.req.raw, { prefix: '/api', context })
    if (!result.matched) {
      await next()
      return
    }
    // Same per-procedure header merge as the `/rpc` bridge below: the
    // REST wire carries the comment-token `Set-Cookie` refresh and the
    // rate-limit `Retry-After` through this channel (the example proxy
    // relies on the Set-Cookie to close the guest-identity loop).
    //
    // `c.newResponse` (NOT a bare `new Response`): Hono only folds the
    // outer middlewares' prepared headers (the api-face `Access-Control-
    // Allow-Origin`, the pipeline's visitor `Set-Cookie`) into responses
    // built through the context.
    const merged = new Headers(result.response.headers)
    context.responseHeaders.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') {
        merged.append(key, value)
      } else {
        merged.set(key, value)
      }
    })
    return c.newResponse(result.response.body, {
      // The RPC wire only emits statuses in Hono's finite StatusCode set.
      status: unsafeCast<StatusCode>(result.response.status),
      headers: merged,
    })
  })

  app.get('/api/content/v1/openapi.json', async (c) => {
    const spec = await getOpenApiSpec()
    return c.json(spec)
  })

  app.use('/rpc/*', csrfGuard)

  app.use('/rpc/*', async (c, next) => {
    const responseHeaders = new Headers()
    const rc = c.var.requestContext
    // Pure projection of the canonical RequestContext (no re-derivation).
    // Deliberately omits `markSessionDirty` — procedures get a read-only
    // session; the comment-token flow uses its own cookie jar instead.
    const context: HandlerContext = {
      request: c.req.raw,
      requestFacts: rc.requestFacts,
      session: rc.session,
      viewer: rc.viewer,
      clientAddress: rc.clientAddress,
      responseHeaders,
      db: rc.db,
    }
    const result = await handler.handle(c.req.raw, { prefix: '/rpc', context })
    if (!result.matched) {
      await next()
      return
    }
    // Merge per-procedure response headers (Set-Cookie etc.) onto the
    // RPC response before handing it back to Hono. Built via
    // `c.newResponse` so the pipeline's prepared headers (visitor
    // `Set-Cookie`) fold in too.
    const merged = new Headers(result.response.headers)
    responseHeaders.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') {
        merged.append(key, value)
      } else {
        merged.set(key, value)
      }
    })
    return c.newResponse(result.response.body, {
      // The RPC wire only emits statuses in Hono's finite StatusCode set.
      status: unsafeCast<StatusCode>(result.response.status),
      headers: merged,
    })
  })

  return app
}
