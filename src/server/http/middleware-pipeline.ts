import type { Context, Hono } from 'hono'

import { pinoLogger } from 'hono-pino'
import { compress } from 'hono/compress'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { RouterContextProvider } from 'react-router'

import type { Env } from '@/server/http/context'
import type { BlogSettingsBundle } from '@/shared/config/types'

import { peekRestoreJobPhase } from '@/server/domains/backup/restore-machine'
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
import { getServerPhase } from '@/server/infra/lifecycle'
import { root } from '@/server/infra/logger'
import { sanitizeReqHeaders, resBindings } from '@/server/infra/logger/sanitizer'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

export interface CspInput {
  bundle: BlogSettingsBundle | null
  nonce: string
  isDev: boolean
}

/**
 * Build the dynamic Content-Security-Policy header value.
 *
 * The policy derives per-request from:
 *  - the per-request `nonce` (production script-src),
 *  - whether we are in dev mode (`unsafe-inline` + blob workers),
 *  - the configured asset CDN host (`blog.assets.asset.host`) so S3-served
 *    media is not blocked. Local storage is covered by `'self'`.
 *
 * Self-hosted browser web fonts (the `/admin/library/fonts` packages) are served
 * from `'self'` (local) or the asset host above (S3), so **no per-font
 * origin is ever injected** — the previous loop that extracted origins from
 * external font CSS URLs was removed when those settings fields were dropped.
 *
 * Extracted as a pure function so unit tests can exercise the real
 * logic directly instead of a parallel inline copy in the test suite.
 */
export function buildCspHeader({ bundle, nonce, isDev }: CspInput): string {
  const origins = new Set<string>()
  if (bundle?.assets?.asset?.host) {
    origins.add(`https://${bundle.assets.asset.host}`)
  }
  const extra = origins.size > 0 ? ' ' + [...origins].join(' ') : ''
  // In development Vite may inject inline scripts (HMR, module preloading,
  // error overlay) that do not carry the request nonce. Allow
  // 'unsafe-inline' for scripts in dev mode so the dev server works
  // correctly; production keeps the strict nonce-only policy.
  const scriptSrc = isDev ? "script-src 'self' 'unsafe-inline'" : `script-src 'self' 'nonce-${nonce}'`
  // Vite's dev client may create blob workers (e.g. for HMR message
  // handling). Without worker-src the browser falls back to script-src,
  // which does not include blob:. Allow blob workers in dev only.
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
  // Dynamic CSP: generates a per-request nonce for script-src and extends
  // the policy with the asset CDN host from blog settings so S3-served
  // media (fonts / images / music) is not blocked after an admin
  // configures storage.
  //
  // Registered BEFORE `secureHeaders` so its `next()` returns *after*
  // `secureHeaders` has already set the static CSP header, letting us
  // overwrite it with the dynamic nonce-based value.
  app.use(async (c, next) => {
    await next()
    // Early short-circuits registered before `requestContextMiddleware`
    // (trailing-slash 301 redirect, WP decoy 404) never derive a
    // RequestContext — leave the static CSP from `secureHeaders` in place
    // for those responses instead of crashing on the missing nonce.
    const rc = c.var.requestContext
    if (!rc) {
      return
    }
    const bundle = getBlogSettingsBundleSync()
    const csp = buildCspHeader({ bundle, nonce: rc.cspNonce, isDev: import.meta.env.DEV })
    c.res.headers.set('Content-Security-Policy', csp)
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

  // Health probes
  app.get('/health', (c) => c.json({ status: 'ok' }))
  app.get('/ready', (c) => {
    const phase = getServerPhase()
    if (phase !== 'running') {
      return c.json({ status: phase, restore: peekRestoreJobPhase() }, 503)
    }
    return c.json({ status: 'ok' })
  })

  // Admin large-file resource routes — mounted BEFORE createApiApp so
  // their bodyLimit middleware is not overridden by the 10 MB global limit.
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
  // Local-storage assets served from $DATA_PATH/storage (images/music/
  // branding uploaded while S3 was disabled). Public — no auth — and
  // supports Range requests for audio seeking.
  app.route('/', localStorageRouter)
  // Self-hosted web-font packages served from a dedicated namespace
  // (/fonts/embedded/<hash>/...) separate from the generic /storage/* route.
  app.route('/', fontsEmbeddedRouter)
  app.route('/', sitemapRouter)
  app.route('/', redirectsRouter)
  // W3C Webmention receive endpoint (unauthenticated by protocol design;
  // per-IP rate limit + moderation queue carry the abuse load).
  app.route('/', webmentionRouter)

  // Admin branding resource routes
  app.route('/', brandingRouter)
}

export async function buildLoadContext(c: { var: Env['Variables']; req: { raw: Request; url: string } }) {
  const rc = c.var.requestContext
  // CRITICAL: await the hydration before returning the context.
  //
  // Route loaders (e.g. `routes/public/home.tsx`) call
  // `requireBlogSettingsSection()` which reads the in-process snapshot
  // synchronously. If we fire-and-forget the hydration, loaders can run
  // before the DB round-trip finishes and hit the
  // "Blog settings have not been hydrated yet" error. Awaiting here
  // guarantees the snapshot is populated before React Router calls any
  // loader. See `tests/it/server/http/middlewares/pipeline.test.ts` for
  // the regression guard.
  await hydrateBlogSettings(rc.db)
  // The single canonical key — every loader/action reads it via
  // `getRequestContext`. Nothing is re-derived per route.
  const context = new RouterContextProvider()
  context.set(requestContext, rc)
  return context
}
