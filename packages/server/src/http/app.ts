import type { Env } from '@kobato/server/http/hono-env'
import type { HandlerContext } from '@kobato/server/http/orpc-base'

import { hydrateBlogSettings } from '@kobato/server/domains/settings/services/hydrate'
import { apiRouter } from '@kobato/server/http/api-router'
import { errorJsonResponse } from '@kobato/server/http/errors'
import { csrfGuard } from '@kobato/server/http/middlewares/csrf'
import { dynamicBodyLimit } from '@kobato/server/http/middlewares/dynamic-body-limit'
import { orpcInputValidationInterceptor } from '@kobato/server/http/orpc-base'
import { createOrpcTraceInterceptor } from '@kobato/server/http/orpc-trace'
import { RPC_BODY_LIMITS } from '@kobato/server/http/request/rpc-body-limits'
import { resolveAppLocalization } from '@kobato/settings/app-localization'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters'
import { formatBytes } from '@kobato/utils/format'
import { RPCHandler } from '@orpc/server/fetch'
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'

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

  for (const limit of RPC_BODY_LIMITS) {
    app.use(
      limit.path,
      bodyLimit({
        maxSize: limit.maxBytes,
        onError: (c: Context<Env>) =>
          errorJsonResponse(
            c,
            413,
            limit.messageKey,
            limit.formatMaxBytes === true
              ? { max: formatBytes(limit.maxBytes, { locale: resolveAppLocalization().locale }) }
              : undefined,
          ),
      }),
    )
  }

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
      markSessionDirty: () => rc.markSessionDirty(),
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
