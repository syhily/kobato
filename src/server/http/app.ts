import { RPCHandler } from '@orpc/server/fetch'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'

import type { Env } from '@/server/http/context'
import type { HandlerContext } from '@/server/http/orpc-base'

import { apiRouter } from '@/server/http/api-router'
import { getBlogSettingsBundleSync } from '@/shared/config/blog'

// ─── oRPC + Hono perimeter ──────────────────────────────
//
// Single mount point for the whole API. `RPCHandler` consumes the
// composed `apiRouter` and answers every request whose path matches
// `/rpc/*`. The Hono wrapper here is responsible for three things:
//
//   1. `bodyLimit` — read from `blog.limits` settings (default 10 MB).
//   2. Context bridging — `c.var.{session,viewer,clientAddress}` is
//   3. Context bridging — `c.var.{session,viewer,clientAddress}` is
//      populated by the perimeter middleware in `src/server.ts`;
//      `responseHeaders` is a fresh `Headers` object that procedures
//      can append to (Set-Cookie etc.) and we merge onto the final
//      Response after the handler resolves.
//
// The permission matrix is no longer an `app.ts` block — each leaf's
// guard is encoded in which base procedure (`publicProc / authedProc /
// adminProc / authorProc` in `orpc-base.ts`) the controller built it
// from. Audit surface: `grep -rn "adminProc\|authorProc"
// src/server/http/controllers/`.

const handler = new RPCHandler(apiRouter)

const DEFAULT_MAX_BODY_SIZE = 10 * 1024 * 1024 // 10 MB

function resolveMaxBodySize(): number {
  const bundle = getBlogSettingsBundleSync()
  const configured = bundle?.limits?.maxRequestBodySize
  return typeof configured === 'number' && configured > 0 ? configured : DEFAULT_MAX_BODY_SIZE
}

export function createApiApp(): Hono<Env> {
  const app = new Hono<Env>()

  app.use(
    bodyLimit({
      maxSize: resolveMaxBodySize(),
      onError: (c) => c.json({ error: { message: '请求体过大' } }, 413),
    }),
  )

  app.use('/rpc/*', async (c, next) => {
    const responseHeaders = new Headers()
    const context: HandlerContext = {
      request: c.req.raw,
      session: c.var.session,
      viewer: c.var.viewer ?? null,
      clientAddress: c.var.clientAddress,
      responseHeaders,
    }
    const result = await handler.handle(c.req.raw, { prefix: '/rpc', context })
    if (!result.matched) {
      await next()
      return
    }
    // Merge per-procedure response headers (Set-Cookie etc.) onto the
    // RPC response before handing it back to Hono. `Headers` has no
    // `size`; we iterate once to detect any-set and again to merge,
    // both via `forEach` which is the only standards-defined surface.
    let extraHeaders = false
    responseHeaders.forEach(() => {
      extraHeaders = true
    })
    if (extraHeaders) {
      const merged = new Headers(result.response.headers)
      responseHeaders.forEach((value, key) => {
        if (key.toLowerCase() === 'set-cookie') {
          merged.append(key, value)
        } else {
          merged.set(key, value)
        }
      })
      return new Response(result.response.body, { status: result.response.status, headers: merged })
    }
    return result.response
  })

  return app
}
