import type { Context, Hono } from 'hono'

import { pinoLogger } from 'hono-pino'
import { compress } from 'hono/compress'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { RouterContextProvider } from 'react-router'

import type { Env } from '@/server/http/context'
import type { BlogSettingsBundle } from '@/shared/config/types'

import { hydrateBlogSettings } from '@/server/domains/settings/services/hydrate'
import { createApiApp } from '@/server/http/app'
import { onErrorHandler } from '@/server/http/errors'
import { corsMiddleware } from '@/server/http/middlewares/cors'
import { honoInstallGateMiddleware } from '@/server/http/middlewares/install-gate'
import { requestContextMiddleware } from '@/server/http/middlewares/request-context'
import { requestTimeout } from '@/server/http/middlewares/request-timeout'
import { trailingSlashNormaliser } from '@/server/http/middlewares/trailing-slash'
import { honoVisitorCookieMiddleware } from '@/server/http/middlewares/visitor-cookie'
import { honoWpDecoyMiddleware } from '@/server/http/middlewares/wp-decoy'
import { readyHandler } from '@/server/http/ready'
import { requestContext } from '@/server/http/request-context'
import { analyticsEventsRouter } from '@/server/http/resources/analytics'
import { assetsRouter } from '@/server/http/resources/assets'
import { backupRouter } from '@/server/http/resources/backup'
import { brandingRouter } from '@/server/http/resources/branding'
import { feedRouter } from '@/server/http/resources/feed'
import { fontsRouter } from '@/server/http/resources/fonts'
import { fontsEmbeddedRouter } from '@/server/http/resources/fonts-embedded'
import { fontsPackageRouter } from '@/server/http/resources/fonts-package'
import { imagesRouter } from '@/server/http/resources/images'
import { localStorageRouter } from '@/server/http/resources/local-storage'
import { maxmindRouter } from '@/server/http/resources/maxmind'
import { musicProxyRouter } from '@/server/http/resources/music-proxy'
import { redirectsRouter } from '@/server/http/resources/redirects'
import { sitemapRouter } from '@/server/http/resources/sitemap'
import { webmentionRouter } from '@/server/http/resources/webmention'
import { webmentionLinkHeader } from '@/server/http/webmention-link-header'
import { root } from '@/server/infra/logger'
import { sanitizeReqHeaders, resBindings } from '@/server/infra/logger/sanitizer'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

export interface CspInput {
  bundle: BlogSettingsBundle | null
  nonce: string
  isDev: boolean
}

/**
 * Dynamic CSP: per-request nonce (prod), dev-only `unsafe-inline` + blob workers, asset CDN host.
 */
export function buildCspHeader({ bundle, nonce, isDev }: CspInput): string {
  const origins = new Set<string>()
  if (bundle?.assets?.asset?.host) {
    origins.add(`https://${bundle.assets.asset.host}`)
  }
  const extra = origins.size > 0 ? ' ' + [...origins].join(' ') : ''
  // Dev: Vite's injected scripts lack the request nonce — allow `unsafe-inline`.
  const scriptSrc = isDev ? "script-src 'self' 'unsafe-inline'" : `script-src 'self' 'nonce-${nonce}'`
  // Dev: Vite's client may create blob workers — `worker-src` needs blob:.
  const workerSrc = isDev ? "worker-src 'self' blob:" : "worker-src 'self'"
  return [
    "default-src 'self'",
    scriptSrc,
    workerSrc,
    `style-src 'self' 'unsafe-inline' ${extra}`,
    `font-src 'self' ${extra}`,
    `img-src 'self' data: blob: ${extra}`,
    `media-src 'self' ${extra}`,
    "connect-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    'upgrade-insecure-requests',
  ].join('; ')
}

export function configureMiddleware(app: Hono<Env>): void {
  app.onError(onErrorHandler)
  app.use(requestId())
  app.use(compress())
  // Overwrite `secureHeaders`' static CSP with the nonce value — must stay registered before it.
  app.use(async (c, next) => {
    await next()
    // Early short-circuits (301/404 before requestContextMiddleware) leave the static CSP.
    const rc = c.var.requestContext
    if (!rc) {
      return
    }
    const bundle = getBlogSettingsBundleSync()
    const csp = buildCspHeader({ bundle, nonce: rc.cspNonce, isDev: import.meta.env.DEV })
    c.res.headers.set('Content-Security-Policy', csp)
    const webmentionLink = webmentionLinkHeader(bundle)
    if (webmentionLink !== null) {
      c.res.headers.append('Link', webmentionLink)
    }
  })

  app.use(
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        workerSrc: ["'self'", 'blob:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
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
  app.use(requestTimeout())
  app.use(requestContextMiddleware)
  app.use(honoInstallGateMiddleware)
  app.use(honoVisitorCookieMiddleware)

  app.get('/health', (c) => c.json({ status: 'ok' }))
  app.get('/ready', readyHandler)

  // Mounted BEFORE createApiApp so their bodyLimit is not overridden by the 10 MB global limit.
  app.route('/', backupRouter)
  app.route('/', fontsRouter)
  app.route('/', fontsPackageRouter)
  app.route('/', maxmindRouter)
  app.route('/', musicProxyRouter)

  // API (oRPC at /rpc/*)
  app.route('/', createApiApp())

  // Stale-chunk guard
  app.all('/assets/*', (c) => c.body(null, 404))

  // Public resource routes
  app.route('/', assetsRouter)
  app.route('/', analyticsEventsRouter)
  app.route('/', feedRouter)
  app.route('/', imagesRouter)
  // $DATA_PATH/storage assets — legacy uploads, public, Range-capable.
  app.route('/', localStorageRouter)
  // Self-hosted web-font packages — separate namespace from /storage/*.
  app.route('/', fontsEmbeddedRouter)
  app.route('/', sitemapRouter)
  app.route('/', redirectsRouter)
  // W3C Webmention receive endpoint — unauthenticated, rate-limited.
  app.route('/', webmentionRouter)

  // Admin branding resource routes
  app.route('/', brandingRouter)
}

export async function buildLoadContext(c: { var: Env['Variables']; req: { raw: Request; url: string } }) {
  const rc = c.var.requestContext
  // CRITICAL: hydrate first — loaders read the in-process settings snapshot synchronously.
  await hydrateBlogSettings(rc.db)
  // Canonical key — every loader/action reads it via `getRequestContext`.
  const context = new RouterContextProvider()
  context.set(requestContext, rc)
  return context
}
