import { RPCHandler } from '@orpc/server/fetch'
import { Hono } from 'hono'

import type { Env } from '@/server/http/context'
import type { HandlerContext } from '@/server/http/orpc-base'

import { apiRouter } from '@/server/http/api-router'
import { csrfGuard } from '@/server/http/middlewares/csrf'
import { dynamicBodyLimit } from '@/server/http/middlewares/dynamic-body-limit'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

// Single API mount: `RPCHandler` answers `/rpc/*` behind a Hono perimeter —
// live-settings body limit, CSRF, and the context projection onto
// `HandlerContext` (+ `responseHeaders`, merged onto the final Response).
const handler = new RPCHandler(apiRouter)

const DEFAULT_MAX_BODY_SIZE = 10 * 1024 * 1024

function resolveMaxBodySize(): number {
  const bundle = getBlogSettingsBundleSync()
  const configured = bundle?.limits?.maxRequestBodySize
  return typeof configured === 'number' && configured > 0 ? configured : DEFAULT_MAX_BODY_SIZE
}

export function createApiApp(): Hono<Env> {
  const app = new Hono<Env>()

  // Live settings snapshot per request — admin changes apply on the next request.
  app.use(
    dynamicBodyLimit({
      maxSize: resolveMaxBodySize,
      onError: (c) => c.json({ error: { message: '请求体过大' } }, 413),
    }),
  )

  app.use('/rpc/*', csrfGuard)

  app.use('/rpc/*', async (c, next) => {
    const responseHeaders = new Headers()
    const rc = c.var.requestContext
    // Pure projection — no re-derivation; `markSessionDirty` deliberately
    // omitted (procedures get a read-only session).
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
    // Merge per-procedure headers (Set-Cookie etc.) onto the RPC response.
    const merged = new Headers(result.response.headers)
    responseHeaders.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') {
        merged.append(key, value)
      } else {
        merged.set(key, value)
      }
    })
    return new Response(result.response.body, {
      status: result.response.status,
      headers: merged,
    })
  })

  return app
}
