import type { BlankEnv } from 'hono/types'
import type { AddressInfo } from 'node:net'

import { type ServerType, serve } from '@hono/node-server'
import { type ServeStaticOptions, serveStatic } from '@hono/node-server/serve-static'
import { type Env, Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { join } from 'node:path'
import { createRequestHandler } from 'react-router'

import type { HonoServerOptionsBase } from '@/server/infra/hono/types/hono-server-options-base'
import type { CreateNodeServerOptions } from '@/server/infra/hono/types/node.https'

import { serverConfig } from '@/server/infra/config'
import { getViteDevServer } from '@/server/infra/hono/dev-server-ref'
import { bindIncomingRequestSocketInfo, getBuildMode, importBuild } from '@/server/infra/hono/helpers'
import { cache } from '@/server/infra/hono/middleware'
import { getLogger } from '@/server/infra/logger'
import { seaVfsRoot } from '@/server/infra/sea'
import { SEA_CLIENT_ASSET_PREFIX } from '@/shared/sea/assets'

const log = getLogger('hono')

/**
 * Static root for the client build: under SEA (`useVfs`) the whole
 * `build/client` tree is mounted read-only in the binary's VFS, so the same
 * `serveStatic` middleware serves it — its stat/stream reads are standard
 * `node:fs` calls the mount answers.
 */
function clientStaticRoot(clientBuildPath: string): string {
  const root = seaVfsRoot()
  return root === null ? clientBuildPath : join(root, SEA_CLIENT_ASSET_PREFIX)
}

interface HonoNodeServerOptions<E extends Env = BlankEnv> extends HonoServerOptionsBase<E> {
  /** Listening listener (production mode only); the default logs the port. */
  listeningListener?: (info: AddressInfo) => void
  /** Customize the node server (e.g. http2). */
  customNodeServer?: CreateNodeServerOptions
  onServe?: (server: ServerType) => void
  /**
   * Override the global Request/Response with lightweight versions; 🚨 can
   * break `request.clone()` `instanceof` checks. @default false
   */
  overrideGlobalObjects?: boolean
  hostname?: string
  serveStaticOptions?: {
    /** Serve-static options for the `build/client/assets` tree. */
    clientAssets?: Omit<ServeStaticOptions<E>, 'root'>
  }
}

export type HonoServerOptions<E extends Env = BlankEnv> = HonoNodeServerOptions<E>

export async function createHonoServer<E extends Env = BlankEnv>(options?: HonoServerOptions<E>) {
  const startTime = Date.now()
  const build = await importBuild()
  const basename = import.meta.env.REACT_ROUTER_HONO_SERVER_BASENAME ?? '/'
  const mergedOptions: HonoServerOptions<E> = {
    ...options,
    listeningListener:
      options?.listeningListener ||
      ((info) => {
        log.info(`🚀 Server started on port ${info.port}`)
        log.info(`🌍 http://127.0.0.1:${info.port}`)

        if (basename !== '/') {
          log.info(`🔗 http://127.0.0.1:${info.port}${basename}`)
        }

        log.info(`🏎️ Server started in ${Date.now() - startTime}ms`)
      }),
    port: options?.port || serverConfig.server.port,
    hostname: options?.hostname || serverConfig.server.host,
    overrideGlobalObjects: options?.overrideGlobalObjects ?? false,
  }
  const mode = getBuildMode()
  const PRODUCTION = mode === 'production'
  const clientBuildPath = `${import.meta.env.REACT_ROUTER_HONO_SERVER_BUILD_DIRECTORY}/client`
  const app = new Hono<E>(mergedOptions.app)

  if (!PRODUCTION) {
    app.use(bindIncomingRequestSocketInfo())
  }

  await mergedOptions.beforeAll?.(app)

  /** Production-only: in dev, Vite serves assets and `build/client` does not exist yet. */
  if (PRODUCTION) {
    app.use(
      `/${import.meta.env.REACT_ROUTER_HONO_SERVER_ASSETS_DIR}/*`,
      cache(60 * 60 * 24 * 365),
      serveStatic({
        root: clientStaticRoot(clientBuildPath),
        ...mergedOptions.serveStaticOptions?.clientAssets,
      }),
    )
  }

  await mergedOptions.configure?.(app)

  const reactRouterApp = new Hono<E>({
    strict: false,
  })

  reactRouterApp.use((c, next) => {
    return createMiddleware<E>(async (ctx) => {
      const requestHandler = createRequestHandler(build, mode)
      const loadContext = mergedOptions.getLoadContext?.(ctx, { build, mode })
      return requestHandler(ctx.req.raw, loadContext instanceof Promise ? await loadContext : loadContext)
    })(c, next)
  })

  app.route(basename, reactRouterApp)

  // Patch https://github.com/remix-run/react-router/issues/12295
  if (basename) {
    app.route(`${basename}.data`, reactRouterApp)
  }

  if (PRODUCTION && mergedOptions.autoServe !== false) {
    const server = serve(
      {
        fetch: app.fetch.bind(app),
        port: mergedOptions.port,
        overrideGlobalObjects: mergedOptions.overrideGlobalObjects,
        hostname: mergedOptions.hostname,
        ...mergedOptions.customNodeServer,
      },
      mergedOptions.listeningListener,
    )
    mergedOptions.onServe?.(server)
  } else {
    const devServer = getViteDevServer()
    if (devServer?.httpServer) {
      const httpServer = devServer.httpServer

      mergedOptions.onServe?.(httpServer)

      log.info('🚧 Dev server started')
    }
  }

  return app
}
