import type { Context, Hono } from 'hono'

import { pinoLogger } from 'hono-pino'
import { compress } from 'hono/compress'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { randomBytes } from 'node:crypto'
import { RouterContextProvider } from 'react-router'

import type { Env } from '@/server/http/context'
import type { BlogSettingsBundle } from '@/shared/config/types'

import { getDb, getPool } from '@/server/bootstrap/db-lifecycle'
import { cspNonceContext, dbContext, poolContext, requestContext, sessionContext } from '@/server/domains/auth/context'
import { hydrateBlogSettings } from '@/server/domains/settings/services/hydrate'
import { createApiApp } from '@/server/http/app'
import { onErrorHandler } from '@/server/http/errors'
import { corsMiddleware } from '@/server/http/middlewares/cors'
import { honoInstallGateMiddleware } from '@/server/http/middlewares/install-gate'
import { requestTimeout } from '@/server/http/middlewares/request-timeout'
import { buildRouteContexts, honoSessionMiddleware } from '@/server/http/middlewares/session'
import { trailingSlashNormaliser } from '@/server/http/middlewares/trailing-slash'
import { honoVisitorCookieMiddleware } from '@/server/http/middlewares/visitor-cookie'
import { honoWpDecoyMiddleware } from '@/server/http/middlewares/wp-decoy'
import { analyticsEventsRouter } from '@/server/http/resources/analytics'
import { assetsRouter } from '@/server/http/resources/assets'
import { backupRouter } from '@/server/http/resources/backup'
import { brandingRouter } from '@/server/http/resources/branding'
import { feedRouter } from '@/server/http/resources/feed'
import { fontsRouter } from '@/server/http/resources/fonts'
import { imagesRouter } from '@/server/http/resources/images'
import { maxmindRouter } from '@/server/http/resources/maxmind'
import { musicProxyRouter } from '@/server/http/resources/music-proxy'
import { redirectsRouter } from '@/server/http/resources/redirects'
import { sitemapRouter } from '@/server/http/resources/sitemap'
import { getRestoreState, getServerPhase } from '@/server/infra/lifecycle'
import { root } from '@/server/infra/logger'
import { sanitizeReqHeaders, resBindings } from '@/server/infra/logger/sanitizer'
import { isRedisHealthy, pingRedis } from '@/server/infra/redis/storage'
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
 *  - externally-hosted origins declared in blog settings
 *    (font CSS URLs + asset CDN host) so admin-configured fonts/images
 *    are not blocked by the strict baseline.
 *
 * Extracted as a pure function so unit tests can exercise the real
 * logic directly instead of a parallel inline copy in the test suite.
 */
export function buildCspHeader({ bundle, nonce, isDev }: CspInput): string {
  const origins = new Set<string>()
  if (bundle) {
    for (const url of [...(bundle.fonts?.globalCss ?? []), ...(bundle.fonts?.postCss ?? [])]) {
      try {
        origins.add(new URL(url).origin)
      } catch {
        // Invalid URL — skip.
      }
    }
    if (bundle.assets?.asset?.host) {
      origins.add(`https://${bundle.assets.asset.host}`)
    }
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
  // Inject db and pool into every request's Hono context so
  // middleware, route handlers, and the oRPC bridge can reach them.
  // getDb()/getPool() are called per-request so pool recreation
  // (backup restore) is reflected immediately.
  app.use('*', async (c, next) => {
    c.set('db', getDb())
    c.set('pool', getPool())
    c.set('cspNonce', randomBytes(16).toString('base64'))
    await next()
  })

  app.onError(onErrorHandler)
  app.use(requestId())
  app.use(compress())
  // Dynamic CSP: generates a per-request nonce for script-src and extends
  // the policy with origins from blog settings (font CSS URLs and asset
  // host) so externally-hosted fonts / images do not get blocked after an
  // admin configures them.
  //
  // Registered BEFORE `secureHeaders` so its `next()` returns *after*
  // `secureHeaders` has already set the static CSP header, letting us
  // overwrite it with the dynamic nonce-based value.
  app.use(async (c, next) => {
    await next()
    const bundle = getBlogSettingsBundleSync()
    const csp = buildCspHeader({ bundle, nonce: c.var.cspNonce, isDev: import.meta.env.DEV })
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
  app.use(honoSessionMiddleware)
  app.use(honoInstallGateMiddleware)
  app.use(honoVisitorCookieMiddleware)

  // Health probes
  app.get('/health', (c) => c.json({ status: 'ok' }))
  app.get('/ready', async (c) => {
    const phase = getServerPhase()
    if (phase !== 'running') {
      return c.json({ status: phase, restore: getRestoreState() }, 503)
    }
    if (!isRedisHealthy()) {
      return c.json({ status: 'degraded', detail: 'redis circuit open' }, 503)
    }
    const redisOk = await pingRedis()
    if (!redisOk) {
      return c.json({ status: 'degraded', detail: 'redis unreachable' }, 503)
    }
    return c.json({ status: 'ok' })
  })

  // Admin large-file resource routes — mounted BEFORE createApiApp so
  // their bodyLimit middleware is not overridden by the 10 MB global limit.
  app.route('/', backupRouter)
  app.route('/', fontsRouter)
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
  app.route('/', sitemapRouter)
  app.route('/', redirectsRouter)

  // Admin branding resource routes
  app.route('/', brandingRouter)
}

export async function buildLoadContext(c: { var: Env['Variables']; req: { raw: Request; url: string } }) {
  const db = getDb()
  const pool = getPool()
  // CRITICAL: await the hydration before returning the context.
  //
  // Route loaders (e.g. `routes/public/home.tsx`) call
  // `requireBlogSettingsSection()` which reads the in-process snapshot
  // synchronously. If we fire-and-forget (warmBlogSettingsSnapshot),
  // loaders can run before the DB round-trip finishes and hit the
  // "Blog settings have not been hydrated yet" error. Awaiting here
  // guarantees the snapshot is populated before React Router calls any
  // loader. See `tests/middleware.pipeline.test.ts` for the regression
  // guard.
  await hydrateBlogSettings(db)
  const { session, request } = buildRouteContexts(c)
  const context = new RouterContextProvider()
  context.set(sessionContext, session)
  context.set(requestContext, request)
  context.set(dbContext, db)
  context.set(poolContext, pool)
  // Defensive: the `*` middleware should always set `cspNonce`, but
  // sub-app routing in Hono can occasionally drop `c.var` values.
  // Generate a fresh nonce here so `entry.server.tsx` never receives
  // an empty string (which React DOM renders as `nonce=""`).
  const cspNonce = c.var.cspNonce || randomBytes(16).toString('base64')
  context.set(cspNonceContext, cspNonce)
  return context
}
