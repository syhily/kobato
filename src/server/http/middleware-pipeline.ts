import type { Hono } from 'hono'

import { pinoLogger } from 'hono-pino'
import { compress } from 'hono/compress'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { RouterContextProvider } from 'react-router'

import type { Env } from '@/server/http/context'

import { getDb, getPool } from '@/server/bootstrap/db-lifecycle'
import { dbContext, poolContext, requestContext, sessionContext } from '@/server/domains/auth/context'
import { warmBlogSettingsSnapshot } from '@/server/domains/settings/snapshot'
import { createApiApp } from '@/server/http/app'
import { onErrorHandler } from '@/server/http/errors'
import { corsMiddleware } from '@/server/http/middlewares/cors'
import { honoInstallGateMiddleware } from '@/server/http/middlewares/install-gate'
import { requestTimeout } from '@/server/http/middlewares/request-timeout'
import { buildRouteContexts, honoSessionMiddleware } from '@/server/http/middlewares/session'
import { trailingSlashNormaliser } from '@/server/http/middlewares/trailing-slash'
import { honoVisitorCookieMiddleware } from '@/server/http/middlewares/visitor-cookie'
import { honoWpDecoyMiddleware } from '@/server/http/middlewares/wp-decoy'
import { buildOpenApiDocument } from '@/server/http/openapi'
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
import { buildOpenApiDocsHtml } from '@/server/render/openapi-docs'

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
  app.use(secureHeaders())
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
  app.get('/ready', (c) => {
    const phase = getServerPhase()
    if (phase !== 'running') {
      return c.json({ status: phase, restore: getRestoreState() }, 503)
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

  // Dev-only API docs
  if (!import.meta.env.PROD) {
    app.get('/openapi.json', async (c) => c.json(await buildOpenApiDocument()))
    app.get('/docs', (c) => c.html(buildOpenApiDocsHtml()))
  }
}

export function buildLoadContext(c: { var: Env['Variables']; req: { raw: Request; url: string } }) {
  const db = getDb()
  const pool = getPool()
  warmBlogSettingsSnapshot(db)
  const { session, request } = buildRouteContexts(c)
  const context = new RouterContextProvider()
  context.set(sessionContext, session)
  context.set(requestContext, request)
  context.set(dbContext, db)
  context.set(poolContext, pool)
  return context
}
