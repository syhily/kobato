import type { Env } from '@kobato/server/http/hono-env.ts'
import type { HandlerContext } from '@kobato/server/http/orpc-base.ts'

import { hydrateBlogSettings } from '@kobato/server/domains/settings/services/hydrate.ts'
import { apiRouter } from '@kobato/server/http/api-router.ts'
import { errorJsonResponse } from '@kobato/server/http/errors.ts'
import { csrfGuard } from '@kobato/server/http/middlewares/csrf.ts'
import { dynamicBodyLimit } from '@kobato/server/http/middlewares/dynamic-body-limit.ts'
import { orpcInputValidationInterceptor } from '@kobato/server/http/orpc-base.ts'
import { createOrpcTraceInterceptor } from '@kobato/server/http/orpc-trace.ts'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters.ts'
import { RPCHandler } from '@orpc/server/fetch'
import { Hono } from 'hono'

const handler = new RPCHandler(apiRouter, {
  clientInterceptors: [createOrpcTraceInterceptor('http'), orpcInputValidationInterceptor],
})

const DEFAULT_MAX_BODY_SIZE = 10 * 1024 * 1024

function resolveMaxBodySize(): number {
  const bundle = getBlogSettingsBundleSync()
  const configured = bundle?.limits?.maxRequestBodySize
  return typeof configured === 'number' && configured > 0 ? configured : DEFAULT_MAX_BODY_SIZE
}

export function createApiApp(): Hono<Env> {
  const app = new Hono<Env>()

  app.use('/rpc/*', async (c, next) => {
    await hydrateBlogSettings(c.var.requestContext.db)
    await next()
  })

  app.use(
    dynamicBodyLimit({
      maxSize: resolveMaxBodySize,
      onError: (c) => errorJsonResponse(c, 413, 'error.api.payloadTooLarge'),
    }),
  )

  app.use('/rpc/*', csrfGuard)

  app.use('/rpc/*', async (c, next) => {
    const responseHeaders = new Headers()
    const rc = c.var.requestContext
    const context: HandlerContext = {
      request: c.req.raw,
      requestFacts: rc.requestFacts,
      session: rc.session,
      viewer: rc.viewer,
      clientAddress: rc.clientAddress,
      responseHeaders,
      db: rc.db,
      settings: rc.settings,
      localization: rc.localization,
    }
    const result = await handler.handle(c.req.raw, { prefix: '/rpc', context })
    if (!result.matched) {
      await next()
      return
    }
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
