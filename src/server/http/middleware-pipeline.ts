import type { Hono } from 'hono'

import { pinoLogger } from 'hono-pino'
import { compress } from 'hono/compress'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { RouterContextProvider } from 'react-router'

import type { Env } from '@/server/http/context'

import { getDb, getPool } from '@/server/bootstrap/db-lifecycle'
import { dbContext, poolContext, requestContext, sessionContext } from '@/server/domains/auth/context'
import { hydrateBlogSettings } from '@/server/domains/settings/snapshot'
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
import { imagesRouter } from '@/server/http/resources/images'
import { redirectsRouter } from '@/server/http/resources/redirects'
import { sitemapRouter } from '@/server/http/resources/sitemap'
import { getRestoreState, getServerPhase } from '@/server/infra/lifecycle'
import { root } from '@/server/infra/logger'
import { sanitizeReqHeaders, resBindings } from '@/server/infra/logger/sanitizer'
import { isRedisHealthy, pingRedis } from '@/server/infra/redis/storage'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

export function configureMiddleware(app: Hono<Env>): void {
  // Inject db and pool into every request's Hono context so
  // middleware, route handlers, and the oRPC bridge can reach them.
  // getDb()/getPool() are called per-request so pool recreation
  // (backup restore) is reflected immediately.
  app.use('*', async (c, next) => {
    c.set('db', getDb())
    c.set('pool', getPool())
    await next()
  })

  app.onError(onErrorHandler)
  app.use(requestId())
  app.use(compress())
  // Dynamic CSP: extend the static policy with origins from blog settings
  // (font CSS URLs and asset host) so externally-hosted fonts / images do
  // not get blocked after an admin configures them.
  //
  // Registered BEFORE `secureHeaders` so its `next()` returns *after*
  // `secureHeaders` has already set the static CSP header, letting us
  // overwrite it with the dynamic value.
  app.use(async (c, next) => {
    await next()
    const bundle = getBlogSettingsBundleSync()
    if (!bundle) {
      return
    }
    const origins = new Set<string>()
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
    if (origins.size === 0) {
      return
    }
    const extra = [...origins].join(' ')
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      `style-src 'self' 'unsafe-inline' ${extra}`,
      `font-src 'self' ${extra}`,
      `img-src 'self' data: blob: http://*.music.126.net https://*.music.126.net ${extra}`,
      `media-src 'self' http://*.music.126.net https://*.music.126.net ${extra}`,
      "connect-src 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      'upgrade-insecure-requests',
    ].join('; ')
    c.res.headers.set('Content-Security-Policy', csp)
  })

  app.use(
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'http://*.music.126.net', 'https://*.music.126.net'],
        mediaSrc: ["'self'", 'http://*.music.126.net', 'https://*.music.126.net'],
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
        onReqBindings: (c) => ({
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

  // Admin backup resource routes — mounted BEFORE createApiApp so
  // large-file endpoints are not caught by the 10 MB body limit.
  app.route('/', backupRouter)

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
  return context
}
