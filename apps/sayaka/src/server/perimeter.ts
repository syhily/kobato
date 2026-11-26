import type { Env } from '@sayaka/server/hono-env'
import type { Context, Hono } from 'hono'

import { createKobatoServerClient } from '@kobato/api/client/create-server-client'
import { buildCspHeader, siteUsesHttps } from '@kobato/settings/csp'
import { sayakaConfig } from '@sayaka/server/config'
import { cookieRelay } from '@sayaka/server/cookie-relay'
import { ACCEPT_CH_HEADER } from '@sayaka/server/csp'
import { forwardKobatoFamilies } from '@sayaka/server/forward'
import { getLogger, rootLogger } from '@sayaka/server/logger'
import { createSayakaRequestContext, sayakaRequestContext } from '@sayaka/server/request-context'
import { rumIntakeRelay } from '@sayaka/server/rum-intake'
import { schemeFix } from '@sayaka/server/scheme-fix'
import { trailingSlashNormaliser } from '@sayaka/server/trailing-slash'
import { getDirectRemoteAddress, visitorAddress } from '@sayaka/server/visitor-address'
import { webmentionLinkHeader } from '@sayaka/server/webmention-link'
import { webmentionReceive } from '@sayaka/server/webmention-receive'
import { honoWpDecoyMiddleware } from '@sayaka/server/wp-decoy'
import { pinoLogger } from 'hono-pino'
import { compress } from 'hono/compress'
import { createMiddleware } from 'hono/factory'
import { requestId } from 'hono/request-id'
import { randomBytes, randomUUID } from 'node:crypto'
import { RouterContextProvider } from 'react-router'

const log = getLogger('perimeter')

export function onSayakaError(error: unknown, c: Context<Env>): Response {
  log.error('Unhandled perimeter error', {
    error: error instanceof Error ? error.message : String(error),
    path: c.req.path,
  })
  return c.text('Internal Server Error', 500)
}

const documentResponseHeaders = createMiddleware<Env>(async (c, next) => {
  await next()
  const ctx = c.var.sayaka
  if (!ctx) {
    return
  }
  if (c.res.status === 304) {
    c.res.headers.delete('Content-Security-Policy')
    return
  }
  const isDev = import.meta.env.DEV
  c.res.headers.set('Content-Security-Policy', buildCspHeader({ bundle: ctx.bundle, nonce: ctx.cspNonce, isDev }))
  if (siteUsesHttps(ctx.bundle)) {
    c.res.headers.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains')
  }
  c.res.headers.set('Accept-CH', ACCEPT_CH_HEADER)
  const webmentionLink = webmentionLinkHeader(ctx.bundle)
  if (webmentionLink !== null) {
    c.res.headers.append('Link', webmentionLink)
  }
})

export function configurePerimeter(app: Hono<Env>): void {
  app.onError(onSayakaError)
  app.use(schemeFix)
  app.use(requestId())
  app.use(
    pinoLogger({
      pino: rootLogger,
      http: {
        onReqBindings: (c: Context<Env>) => ({
          requestId: c.var.requestId,
          req: {
            method: c.req.method,
            url: c.req.path,
          },
        }),
        onResBindings: (c: Context<Env>) => ({
          requestId: c.var.requestId,
          res: {
            status: c.res.status,
          },
        }),
      },
    }),
  )
  app.use(compress())
  app.use(documentResponseHeaders)
  app.use(cookieRelay)
  app.use(trailingSlashNormaliser)
  app.use(honoWpDecoyMiddleware)
  app.use(forwardKobatoFamilies)
  app.use(rumIntakeRelay)
  app.use(webmentionReceive)
}

export function buildLoadContext(c: Context<Env>): RouterContextProvider {
  const clientAddress = visitorAddress(c.req.raw, getDirectRemoteAddress(c), sayakaConfig.trustedProxies)
  const analyticsEventId = randomUUID()
  const { client, responseHeaders, takeResourceStream } = createKobatoServerClient({
    url: sayakaConfig.kobatoRpcUrl,
    request: c.req.raw,
    clientAddress,
    analyticsEventId,
  })
  const sayaka = createSayakaRequestContext({
    cspNonce: randomBytes(16).toString('base64'),
    client,
    responseHeaders,
    takeResourceStream,
    analyticsEventId,
  })
  c.set('sayaka', sayaka)
  const provider = new RouterContextProvider()
  provider.set(sayakaRequestContext, sayaka)
  return provider
}
