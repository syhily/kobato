import type { Context } from 'hono'

import { serve } from '@hono/node-server'
import { pinoLogger } from 'hono-pino'
import { compress } from 'hono/compress'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { RouterContextProvider } from 'react-router'

import type { Env } from '@/server/http/context'

import { flushAccessLog, initAccessLogBatcher, resetAccessLogBatcher } from '@/server/domains/analytics/batcher'
import { flushPageViews, initPageViewBatcher, resetPageViewBatcher } from '@/server/domains/analytics/pv-batcher'
import { flushAuditLog, initAuditLogBatcher, resetAuditLogBatcher } from '@/server/domains/audit/batcher'
import { scheduleNextArchive } from '@/server/domains/audit/scheduler'
import { dbContext, poolContext, requestContext, sessionContext } from '@/server/domains/auth/context'
import { registerRestoreComplete } from '@/server/domains/backup/restore-orchestrator'
import { initBackupScheduler, scheduleNextBackup } from '@/server/domains/backup/scheduler'
import { resetLikeTokenSweep } from '@/server/domains/comments/likes'
import { refreshBlogSettings, warmBlogSettingsSnapshot } from '@/server/domains/settings/snapshot'
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
import { analyticsEventsRouter } from '@/server/http/resources/analytics'
import { assetsRouter } from '@/server/http/resources/assets'
import { backupRouter } from '@/server/http/resources/backup'
import { brandingRouter } from '@/server/http/resources/branding'
import { feedRouter } from '@/server/http/resources/feed'
import { imagesRouter } from '@/server/http/resources/images'
import { redirectsRouter } from '@/server/http/resources/redirects'
import { sitemapRouter } from '@/server/http/resources/sitemap'
import { emitEncryptionStartupWarning } from '@/server/infra/crypto/secret-encryption'
import { migrateDatabase } from '@/server/infra/db/migrate'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { isVitest, PORT } from '@/server/infra/env'
import { createHonoServer } from '@/server/infra/hono/node'
import {
  getRestoreState,
  getServerPhase,
  registerShutdownHook,
  restartServer,
  setHttpServer,
  setRestartApp,
  setRestartDb,
  setRestartRefreshSettings,
  setServerPhase,
} from '@/server/infra/lifecycle'
import { root } from '@/server/infra/logger'
import { buildOpenApiDocsHtml } from '@/server/render/openapi-docs'

// ─── HMR-safe resource creation ──────────────────────────
// In dev, React Router re-evaluates server.ts on every HMR cycle.
// import.meta.hot.data persists across those re-evaluations so the
// Pool, Drizzle instance, and migration flag survive without
// leaking connections or re-running completed migrations.

const hmr = import.meta.hot?.data as
  | {
      pool?: ReturnType<typeof createDbPool>['pool']
      db?: ReturnType<typeof createDbPool>['db']
      migrationsRan?: boolean
    }
  | undefined

let db!: ReturnType<typeof createDbPool>['db']
let pool!: ReturnType<typeof createDbPool>['pool']

function initPool() {
  const instance = hmr?.db && hmr?.pool ? { db: hmr.db, pool: hmr.pool } : createDbPool()
  db = instance.db
  pool = instance.pool
  const hot = import.meta.hot
  if (hot && hmr) {
    hmr.db = db
    hmr.pool = pool
  }
  setRestartDb(db)
  setRestartRefreshSettings(refreshBlogSettings)
  initAccessLogBatcher(pool)
  initPageViewBatcher(db)
  initAuditLogBatcher(db, pool)
}

initPool()

// Register restore completion: recreate pool, restart server, reset state.
registerRestoreComplete(async (success, err) => {
  if (!success) {
    root.error({ err: err?.message }, 'Restore failed, restarting server for recovery')
  } else {
    root.info('Restore succeeded, restarting server')
  }

  let recreated = false
  try {
    await recreatePool()
    recreated = true
  } catch (recreateErr) {
    root.error(
      { err: recreateErr instanceof Error ? recreateErr.message : String(recreateErr) },
      'Pool recreation failed during restore completion',
    )
  }

  if (recreated) {
    try {
      scheduleNextArchive(db, pool)
    } catch (schedErr) {
      root.warn(
        { err: schedErr instanceof Error ? schedErr.message : String(schedErr) },
        'Failed to reschedule archive after restore',
      )
    }
  }

  try {
    await restartServer()
    root.info('Restore completion finished, server back online')
  } catch (restartErr) {
    root.error(
      { err: restartErr instanceof Error ? restartErr.message : String(restartErr) },
      'Server restart failed during restore completion',
    )
  }
})

// Run migrations once per process (HMR-safe via hmr.migrationsRan).
if (!hmr?.migrationsRan) {
  if (!isVitest()) {
    await migrateDatabase()
  }
  const hot = import.meta.hot
  if (hot && hmr) {
    hmr.migrationsRan = true
  }
}

// Register shutdown once per process. Priority 0 so all batchers
// (priority 100) flush before the pool is closed.
registerShutdownHook(() => closePool(pool), 0)

export async function recreatePool(): Promise<{ db: typeof db; pool: typeof pool }> {
  try {
    await flushAuditLog()
  } catch (err) {
    root.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'Audit log flush failed before pool recreation',
    )
  }
  try {
    await flushAccessLog()
  } catch (err) {
    root.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'Access log flush failed before pool recreation',
    )
  }
  try {
    await flushPageViews()
  } catch (err) {
    root.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'Page view flush failed before pool recreation',
    )
  }

  const instance = createDbPool()
  db = instance.db
  pool = instance.pool
  const hot = import.meta.hot
  if (hot && hmr) {
    hmr.db = db
    hmr.pool = pool
  }
  setRestartDb(db)
  resetAccessLogBatcher()
  resetPageViewBatcher()
  resetAuditLogBatcher()
  initAccessLogBatcher(pool)
  initPageViewBatcher(db)
  initAuditLogBatcher(db, pool)
  resetLikeTokenSweep()
  return instance
}

// ─── Logging sanitisation ────────────────────────────────

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

// ─── Server assembly ─────────────────────────────────────

const app = await createHonoServer<Env>({
  autoServe: false,
  configure(app) {
    // Inject db and pool into every request's Hono context so
    // middleware, route handlers, and the oRPC bridge can reach them.
    app.use('*', async (c, next) => {
      c.set('db', db)
      c.set('pool', pool)
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

    // ─── Admin backup resource routes ─────────────────────
    // Mounted BEFORE createApiApp so large-file endpoints
    // (upload-restore, setup-restore) are not caught by the
    // 10 MB content-length check in createApiApp.
    app.route('/', backupRouter)

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
    app.route('/', assetsRouter)
    app.route('/', analyticsEventsRouter)
    app.route('/', feedRouter)
    app.route('/', imagesRouter)
    app.route('/', sitemapRouter)
    app.route('/', redirectsRouter)

    // ─── Admin branding resource routes ──────────────────
    app.route('/', brandingRouter)

    // ─── Dev-only API docs ────────────────────────────────
    if (!import.meta.env.PROD) {
      app.get('/openapi.json', async (c) => c.json(await buildOpenApiDocument()))
      app.get('/docs', (c) => c.html(buildOpenApiDocsHtml()))
    }
  },
  getLoadContext(c) {
    // Warm the settings snapshot so the root loader's
    // `getBlogSettingsBundleSync()` reads fresh data. Only fires for
    // React Router SSR routes — static assets skip this entirely.
    // Idempotent: concurrent requests share the same in-flight promise.
    // Errors are handled internally; never leaks an unhandled rejection.
    warmBlogSettingsSnapshot(db)
    const { session, request } = buildRouteContexts(c)
    const context = new RouterContextProvider()
    context.set(sessionContext, session)
    context.set(requestContext, request)
    context.set(dbContext, db)
    context.set(poolContext, pool)
    return context
  },
})

wrapFetchWithLeakedResponseHandler(app)

const httpServer = import.meta.env.PROD
  ? serve({ fetch: app.fetch.bind(app), port: PORT }, (info) => {
      root.info(`🚀 Server started on port ${info.port}`)
      root.info(`🌍 http://127.0.0.1:${info.port}`)
      root.info(`🏎️ Server started`)
    })
  : null

setRestartApp(app)
if (httpServer) {
  setHttpServer(httpServer)
}

// Start schedulers after server is configured
scheduleNextBackup()
initBackupScheduler()
scheduleNextArchive(db, pool)
emitEncryptionStartupWarning()

setServerPhase('running')

if (import.meta.hot) {
  import.meta.hot.accept()
}

export default app
