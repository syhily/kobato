import type { Context } from 'hono'

import { pinoLogger } from 'hono-pino'
import { compress } from 'hono/compress'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { RouterContextProvider } from 'react-router'

import type { Env } from '@/server/http/context'

import { scheduleNextArchive } from '@/server/domains/audit/scheduler'
import { requestContext, sessionContext } from '@/server/domains/auth/context'
import { scheduleNextBackup } from '@/server/domains/backup/scheduler'
import { createApiApp } from '@/server/http/app'
import { onErrorHandler } from '@/server/http/errors'
import { wrapFetchWithLeakedResponseHandler } from '@/server/http/leaked-response'
import { corsMiddleware } from '@/server/http/middlewares/cors'
import { honoInstallGateMiddleware } from '@/server/http/middlewares/install-gate'
import { requestTimeout } from '@/server/http/middlewares/request-timeout'
import { buildRouteContexts, honoSessionMiddleware } from '@/server/http/middlewares/session'
import { trailingSlashNormaliser } from '@/server/http/middlewares/trailing-slash'
import { honoVisitorCookieMiddleware } from '@/server/http/middlewares/visitor-cookie'
import { honoWpDecoyMiddleware } from '@/server/http/middlewares/wp-decoy'
import { buildOpenApiDocument } from '@/server/http/openapi'
import { analyticsEventsRouter } from '@/server/http/resources/analytics-events'
import { backupDownloadRouter } from '@/server/http/resources/backup-download'
import { backupUploadRouter } from '@/server/http/resources/backup-upload'
import { feedRouter } from '@/server/http/resources/feed'
import { imagesRouter } from '@/server/http/resources/images'
import { redirectsRouter } from '@/server/http/resources/redirects'
import { sitemapRouter } from '@/server/http/resources/sitemap'
import { createHonoServer } from '@/server/infra/hono/node'
import { root } from '@/server/infra/logger'
import { setHttpServer } from '@/server/infra/shutdown'
import { buildOpenApiDocsHtml } from '@/server/render/openapi-docs'

// L5: authorization tokens must NEVER reach logs.
// L3: cookie, user-agent, and any header carrying IP need {E}…{/E} markers
// per `src/server/infra/logger.ts` privacy tagging convention.
const L5_REQ_HEADERS = new Set(['authorization'])
const L3_REQ_HEADERS = new Set([
  'cookie',
  'user-agent',
  'x-forwarded-for',
  'cf-connecting-ip',
  'true-client-ip',
  'x-real-ip',
  'forwarded',
])

function sanitizeReqHeaders(headers: Record<string, string | undefined>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase()
    if (L5_REQ_HEADERS.has(lower)) {
      out[key] = '[REDACTED]'
    } else if (L3_REQ_HEADERS.has(lower) && value) {
      out[key] = `{E}${value}{/E}`
    } else {
      out[key] = value
    }
  }
  return out
}

function resBindings(c: Context) {
  const headers: Record<string, string> = {}
  c.res.headers.forEach((value, key) => {
    headers[key] = key.toLowerCase() === 'set-cookie' && value ? `{E}${value}{/E}` : value
  })
  return { res: { status: c.res.status, headers } }
}

const server = await createHonoServer<Env>({
  onServe: (httpServer) => {
    setHttpServer(httpServer)
  },
  configure(app) {
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
    app.get('/ready', (c) => c.json({ status: 'ok' }))

    // ─── API (oRPC at /rpc/*) ────────────────────────────
    app.route('/', createApiApp())

    // ─── Stale-chunk guard ────────────────────────────────
    // react-router-hono-server registers serveStatic for
    // /assets/* BEFORE configure().  When a stale tab requests a
    // JS/CSS chunk from a previous deploy that no longer exists,
    // serveStatic calls next() and the request would fall through
    // to React Router's SSR catch-all, which returns HTML.  The
    // browser then throws a SyntaxError (not a ChunkLoadError),
    // so the client's useChunkErrorRecovery never fires.
    //
    // This handler sits AFTER serveStatic but BEFORE React Router.
    // If the asset exists, serveStatic returns it and this is
    // never reached.  If the asset is missing, we return 404 so
    // the browser's dynamic import() surfaces a real fetch
    // failure that is recognised by isChunkLoadError().
    app.all('/assets/*', (c) => c.body(null, 404))

    // ─── Public resource routes ───────────────────────────
    app.route('/', analyticsEventsRouter)
    app.route('/', feedRouter)
    app.route('/', imagesRouter)
    app.route('/', sitemapRouter)
    app.route('/', redirectsRouter)

    // ─── Admin backup resource routes ─────────────────────
    app.route('/', backupDownloadRouter)
    app.route('/', backupUploadRouter)

    // ─── Dev-only API docs ────────────────────────────────
    if (!import.meta.env.PROD) {
      app.get('/openapi.json', async (c) => c.json(await buildOpenApiDocument()))
      app.get('/docs', (c) => c.html(buildOpenApiDocsHtml()))
    }
  },
  getLoadContext(c) {
    const { session, request } = buildRouteContexts(c)
    const context = new RouterContextProvider()
    context.set(sessionContext, session)
    context.set(requestContext, request)
    return context
  },
})

wrapFetchWithLeakedResponseHandler(server)

// Start schedulers after server is configured
scheduleNextBackup()
scheduleNextArchive()

export default server
