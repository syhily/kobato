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
import { trustProxy } from '@/server/http/middlewares/trust-proxy'
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
import { rumIntakeRouter } from '@/server/http/resources/rum-intake'
import { rumStatusRouter } from '@/server/http/resources/rum-status'
import { sitemapRouter } from '@/server/http/resources/sitemap'
import { webmentionRouter } from '@/server/http/resources/webmention'
import { webmentionLinkHeader } from '@/server/http/webmention-link-header'
import { root } from '@/server/infra/logger'
import { sanitizeReqHeaders, resBindings } from '@/server/infra/logger/sanitizer'
import { devTraceRequestMiddleware } from '@/server/infra/trace/middleware'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

export interface CspInput {
  bundle: BlogSettingsBundle | null
  nonce: string
  isDev: boolean
}

/**
 * Opt the origin into User-Agent Client Hints: Chromium then sends the
 * `Sec-CH-UA-*` headers, which the analytics enrich pipeline persists.
 */
export const ACCEPT_CH_HEADER =
  'Sec-CH-UA, Sec-CH-UA-Mobile, Sec-CH-UA-Platform, Sec-CH-UA-Platform-Version, Sec-CH-UA-Model, Sec-CH-UA-Full-Version, Sec-CH-UA-Full-Version-List, Sec-CH-UA-Arch, Sec-CH-UA-Bitness, Sec-CH-UA-Form-Factors'

/**
 * Dynamic CSP: per-request nonce in prod, `unsafe-inline` + blob workers in dev.
 * The asset CDN host is trusted for style/font/img/media, and the configured site
 * origin for img/media only (saved content carries absolute asset URLs built
 * against `siteIdentity.website`). `connect-src` never widens: browser RUM posts
 * to the same-origin relay.
 */
export function buildCspHeader({ bundle, nonce, isDev }: CspInput): string {
  const origins = new Set<string>()
  if (bundle?.assets?.asset?.host) {
    origins.add(`https://${bundle.assets.asset.host}`)
  }
  const extra = origins.size > 0 ? ' ' + [...origins].join(' ') : ''
  const website = bundle?.siteIdentity?.website
  const siteOrigin = website ? URL.parse(website)?.origin : undefined
  const mediaExtra = siteOrigin && !origins.has(siteOrigin) ? `${extra} ${siteOrigin}` : extra
  // Dev: Vite's injected scripts lack the request nonce — allow `unsafe-inline`.
  const scriptSrc = isDev ? "script-src 'self' 'unsafe-inline'" : `script-src 'self' 'nonce-${nonce}'`
  // Dev: Vite's client may create blob workers — `worker-src` needs blob:.
  const workerSrc = isDev ? "worker-src 'self' blob:" : "worker-src 'self'"
  // Dev: a dev server routinely renders a prod-shaped database whose saved content
  // carries asset URLs baked under another environment's site origin, so allow any
  // https image/media source; production stays on the explicit origin list above.
  const devMediaExtra = isDev ? `${mediaExtra} https:` : mediaExtra
  return [
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
    'upgrade-insecure-requests',
  ].join('; ')
}

export function configureMiddleware(app: Hono<Env>): void {
  app.onError(onErrorHandler)
  // Trust-proxy must land before anything reads the request URL (request-context
  // derivation, RR's `.data` action origin check).
  app.use(trustProxy)
  app.use(requestId())
  // The root server span starts after trust-proxy/request-ID (so the W3C parent and
  // normalized request exist) and BEFORE compression (so it covers the whole pipeline).
  app.use(devTraceRequestMiddleware())
  app.use(compress())
  // Overwrite `secureHeaders`' static CSP with the nonce value — must stay registered before it.
  app.use(async (c, next) => {
    await next()
    // Early short-circuits (301/404 before requestContextMiddleware) leave the static CSP.
    const rc = c.var.requestContext
    if (!rc) {
      return
    }
    // A 304 revalidates a CACHED document whose inline scripts carry the ORIGINAL
    // request's nonce. Revalidating caches fold the 304's headers into the stored
    // entry (RFC 9111 §4.3.4), so strip CSP (the static one included) to keep the
    // policy that matches the stored body.
    if (c.res.status === 304) {
      c.res.headers.delete('Content-Security-Policy')
      return
    }
    const bundle = getBlogSettingsBundleSync()
    const isDev = import.meta.env.DEV
    const csp = buildCspHeader({ bundle, nonce: rc.cspNonce, isDev })
    c.res.headers.set('Content-Security-Policy', csp)
    // UA-CH recovers device model / OS detail erased by Chrome's UA reduction
    // (first-party, so no Permissions-Policy delegation is needed).
    c.res.headers.set('Accept-CH', ACCEPT_CH_HEADER)
    const webmentionLink = webmentionLinkHeader(bundle)
    if (webmentionLink !== null) {
      c.res.headers.append('Link', webmentionLink)
    }
  })

  app.use(
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        // Dev: Vite / React Router tooling injects un-nonced inline scripts. This
        // static policy only survives non-HTML short-circuits (301/404) that never
        // reach `requestContextMiddleware`, so no inline script is legitimate there.
        scriptSrc: import.meta.env.DEV ? ["'self'", "'unsafe-inline'"] : ["'self'"],
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
  app.use(
    requestTimeout(30_000, [
      // Backup upload/decrypt staging moves up to 500 MB inside the request
      // — a slow uplink needs far more than the 30s default.
      { prefix: '/api/admin/backup/upload-restore', timeoutMs: 30 * 60_000 },
      { prefix: '/api/setup/restore', timeoutMs: 30 * 60_000 },
    ]),
  )
  app.use(requestContextMiddleware)
  app.use(honoInstallGateMiddleware)

  app.get('/health', (c) => c.json({ status: 'ok' }))
  app.get('/ready', readyHandler)

  // RUM drift signal + same-origin intake relay, mounted in every build: settings
  // changes never re-mount these routers, so the gate is evaluated per request
  // inside the handlers. Both paths stay out of HTTP spans and RUM activity.
  app.route('/', rumStatusRouter)
  app.route('/', rumIntakeRouter)

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

  app.route('/', brandingRouter)
}

export async function buildLoadContext(c: { var: Env['Variables']; req: { raw: Request; url: string } }) {
  const rc = c.var.requestContext
  // Hydrate first: loaders read the in-process settings snapshot synchronously.
  await hydrateBlogSettings(rc.db)
  const context = new RouterContextProvider()
  context.set(requestContext, rc)
  return context
}
