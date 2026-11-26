import type { Env } from '@kobato/server/http/hono-env'
import type { Context, Hono } from 'hono'

import { createApiApp } from '@kobato/server/http/app'
import { onErrorHandler } from '@kobato/server/http/errors'
import { corsMiddleware } from '@kobato/server/http/middlewares/cors'
import { honoInstallGateMiddleware } from '@kobato/server/http/middlewares/install-gate'
import { requestContextMiddleware } from '@kobato/server/http/middlewares/request-context'
import { requestTimeout } from '@kobato/server/http/middlewares/request-timeout'
import { trailingSlashNormaliser } from '@kobato/server/http/middlewares/trailing-slash'
import { trustProxy } from '@kobato/server/http/middlewares/trust-proxy'
import { honoWpDecoyMiddleware } from '@kobato/server/http/middlewares/wp-decoy'
import { readyHandler } from '@kobato/server/http/ready'
import { REQUEST_TIMEOUT_OVERRIDES } from '@kobato/server/http/request/rpc-timeout-overrides'
import { root } from '@kobato/server/infra/logger'
import { sanitizeReqHeaders, resBindings } from '@kobato/server/infra/logger/sanitizer'
import { devTraceRequestMiddleware } from '@kobato/server/infra/trace/middleware'
import { siteUsesHttps } from '@kobato/settings/csp'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters'
import { pinoLogger } from 'hono-pino'
import { compress } from 'hono/compress'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'

export function configureMiddleware(app: Hono<Env>): void {
  app.onError(onErrorHandler)
  app.use(trustProxy)
  app.use(requestId())
  app.use(devTraceRequestMiddleware())
  app.use(compress())
  app.use(async (c, next) => {
    await next()
    if (siteUsesHttps(getBlogSettingsBundleSync())) {
      c.res.headers.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains')
    }
  })

  app.use(
    secureHeaders({
      strictTransportSecurity: false,
      overwrite: false,
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: import.meta.env.DEV ? ["'self'", "'unsafe-inline'"] : ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    }),
  )
  app.use(corsMiddleware())
  app.use(
    pinoLogger({
      pino: root,
      http: {
        onReqBindings: (c: Context<Env>) => ({
          requestId: c.var.requestId,
          req: {
            url: c.req.path,
            method: c.req.method,
            headers: sanitizeReqHeaders(c.req.header()),
          },
        }),
        onResBindings: resBindings,
      },
    }),
  )
  app.use(trailingSlashNormaliser)
  app.use(honoWpDecoyMiddleware)
  app.use(requestTimeout(30_000, REQUEST_TIMEOUT_OVERRIDES))
  app.use(requestContextMiddleware)
  app.use(honoInstallGateMiddleware)

  app.get('/health', (c) => c.json({ status: 'ok' }))
  app.get('/ready', readyHandler)

  app.route('/', createApiApp())

  app.all('/assets/*', (c) => c.body(null, 404))
}
