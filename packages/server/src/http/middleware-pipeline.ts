import type { Env } from '@kobato/server/http/hono-env'
import type { BlogSettingsBundle } from '@kobato/settings/types'
import type { Context, Hono } from 'hono'

import { hydrateBlogSettings } from '@kobato/server/domains/settings/services/hydrate'
import { webmentionLinkHeader } from '@kobato/server/domains/webmentions/link-header'
import { createApiApp } from '@kobato/server/http/app'
import { onErrorHandler } from '@kobato/server/http/errors'
import { corsMiddleware } from '@kobato/server/http/middlewares/cors'
import { honoInstallGateMiddleware } from '@kobato/server/http/middlewares/install-gate'
import { requestContextMiddleware } from '@kobato/server/http/middlewares/request-context'
import { requestTimeout, type TimeoutOverride } from '@kobato/server/http/middlewares/request-timeout'
import { trailingSlashNormaliser } from '@kobato/server/http/middlewares/trailing-slash'
import { trustProxy } from '@kobato/server/http/middlewares/trust-proxy'
import { honoWpDecoyMiddleware } from '@kobato/server/http/middlewares/wp-decoy'
import { readyHandler } from '@kobato/server/http/ready'
import { requestContext } from '@kobato/server/http/request-context'
import { analyticsEventsRouter } from '@kobato/server/http/resources/analytics'
import { assetsRouter } from '@kobato/server/http/resources/assets'
import { backupRouter } from '@kobato/server/http/resources/backup'
import { brandingRouter } from '@kobato/server/http/resources/branding'
import { feedRouter } from '@kobato/server/http/resources/feed'
import { fontsRouter } from '@kobato/server/http/resources/fonts'
import { fontsEmbeddedRouter } from '@kobato/server/http/resources/fonts-embedded'
import { fontsPackageRouter } from '@kobato/server/http/resources/fonts-package'
import { imagesRouter } from '@kobato/server/http/resources/images'
import { localStorageRouter } from '@kobato/server/http/resources/local-storage'
import { maxmindRouter } from '@kobato/server/http/resources/maxmind'
import { musicProxyRouter } from '@kobato/server/http/resources/music-proxy'
import { redirectsRouter } from '@kobato/server/http/resources/redirects'
import { rumIntakeRouter } from '@kobato/server/http/resources/rum-intake'
import { rumStatusRouter } from '@kobato/server/http/resources/rum-status'
import { sitemapRouter } from '@kobato/server/http/resources/sitemap'
import { webmentionRouter } from '@kobato/server/http/resources/webmention'
import { root } from '@kobato/server/infra/logger'
import { sanitizeReqHeaders, resBindings } from '@kobato/server/infra/logger/sanitizer'
import { devTraceRequestMiddleware } from '@kobato/server/infra/trace/middleware'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters'
import { pinoLogger } from 'hono-pino'
import { compress } from 'hono/compress'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { RouterContextProvider } from 'react-router'

export interface CspInput {
  bundle: BlogSettingsBundle | null
  nonce: string
  isDev: boolean
}

export const ACCEPT_CH_HEADER =
  'Sec-CH-UA, Sec-CH-UA-Mobile, Sec-CH-UA-Platform, Sec-CH-UA-Platform-Version, Sec-CH-UA-Model, Sec-CH-UA-Full-Version, Sec-CH-UA-Full-Version-List, Sec-CH-UA-Arch, Sec-CH-UA-Bitness, Sec-CH-UA-Form-Factors'

export function buildCspHeader({ bundle, nonce, isDev }: CspInput): string {
  const origins = new Set<string>()
  const asset = bundle?.assets?.asset
  if (asset?.host) {
    origins.add(`${asset.scheme ?? 'https'}://${asset.host}`)
  }
  const extra = origins.size > 0 ? ' ' + [...origins].join(' ') : ''
  const website = bundle?.siteIdentity?.website
  const siteOrigin = website ? URL.parse(website)?.origin : undefined
  const mediaExtra = siteOrigin && !origins.has(siteOrigin) ? `${extra} ${siteOrigin}` : extra
  const scriptSrc = isDev ? "script-src 'self' 'unsafe-inline'" : `script-src 'self' 'nonce-${nonce}'`
  const workerSrc = isDev ? "worker-src 'self' blob:" : "worker-src 'self'"
  const devMediaExtra = isDev ? `${mediaExtra} https:` : mediaExtra
  const directives = [
    "default-src 'self'",
    scriptSrc,
    workerSrc,
    `style-src 'self' 'unsafe-inline' ${extra}`,
    `font-src 'self' ${extra}`,
    `img-src 'self' data: blob: ${devMediaExtra}`,
    `media-src 'self' ${devMediaExtra}`,
    "connect-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
  ]
  if (siteUsesHttps(bundle)) {
    directives.push('upgrade-insecure-requests')
  }
  return directives.join('; ')
}

export function siteUsesHttps(bundle: BlogSettingsBundle | null): boolean {
  return URL.parse(bundle?.siteIdentity?.website ?? '')?.protocol === 'https:'
}

/** The restore endpoints run on a 30-minute budget — every other request gets the 30s default above. */
export const REQUEST_TIMEOUT_OVERRIDES: readonly TimeoutOverride[] = [
  { prefix: '/api/admin/backup/upload-restore', timeoutMs: 30 * 60_000 },
  { prefix: '/rpc/admin/backup/uploadRestoreDecrypt', timeoutMs: 30 * 60_000 },
  { prefix: '/api/setup/restore', timeoutMs: 30 * 60_000 },
]

export function configureMiddleware(app: Hono<Env>): void {
  app.onError(onErrorHandler)
  app.use(trustProxy)
  app.use(requestId())
  app.use(devTraceRequestMiddleware())
  app.use(compress())
  app.use(async (c, next) => {
    await next()
    const rc = c.var.requestContext
    if (!rc) {
      return
    }
    if (c.res.status === 304) {
      c.res.headers.delete('Content-Security-Policy')
      return
    }
    const bundle = getBlogSettingsBundleSync()
    const isDev = import.meta.env.DEV
    const csp = buildCspHeader({ bundle, nonce: rc.cspNonce, isDev })
    c.res.headers.set('Content-Security-Policy', csp)
    if (siteUsesHttps(bundle)) {
      c.res.headers.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains')
    }
    c.res.headers.set('Accept-CH', ACCEPT_CH_HEADER)
    const webmentionLink = webmentionLinkHeader(bundle)
    if (webmentionLink !== null) {
      c.res.headers.append('Link', webmentionLink)
    }
  })

  app.use(
    secureHeaders({
      strictTransportSecurity: false,
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

  app.route('/', rumStatusRouter)
  app.route('/', rumIntakeRouter)

  app.route('/', backupRouter)
  app.route('/', fontsRouter)
  app.route('/', fontsPackageRouter)
  app.route('/', maxmindRouter)
  app.route('/', musicProxyRouter)

  app.route('/', createApiApp())

  app.all('/assets/*', (c) => c.body(null, 404))

  app.route('/', assetsRouter)
  app.route('/', analyticsEventsRouter)
  app.route('/', feedRouter)
  app.route('/', imagesRouter)
  app.route('/', localStorageRouter)
  app.route('/', fontsEmbeddedRouter)
  app.route('/', sitemapRouter)
  app.route('/', redirectsRouter)
  app.route('/', webmentionRouter)

  app.route('/', brandingRouter)
}

export async function buildLoadContext(c: { var: Env['Variables']; req: { raw: Request; url: string } }) {
  const rc = c.var.requestContext
  await hydrateBlogSettings(rc.db)
  const context = new RouterContextProvider()
  context.set(requestContext, rc)
  return context
}
