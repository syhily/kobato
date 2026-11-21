import type { HonoServerOptionsBase } from '@kobato/server/infra/hono/types/hono-server-options-base.d.ts'
import type { CreateNodeServerOptions } from '@kobato/server/infra/hono/types/node.https.d.ts'
import type { BlankEnv } from 'hono/types'
import type { AddressInfo } from 'node:net'

import { type ServerType, serve } from '@hono/node-server'
import { type ServeStaticOptions, serveStatic } from '@hono/node-server/serve-static'
import { SEA_CLIENT_ASSET_PREFIX } from '@kobato/distribution/sea-assets'
import { serverConfig } from '@kobato/server/infra/config'
import { bindIncomingRequestSocketInfo, getBuildMode, importBuild } from '@kobato/server/infra/hono/build-runtime'
import { cache } from '@kobato/server/infra/hono/cache-middleware'
import { getViteDevServer } from '@kobato/server/infra/hono/dev-server-ref'
import { getLogger } from '@kobato/server/infra/logger'
import { seaVfsRoot } from '@kobato/server/infra/sea/sea'
import { type Env, Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { join } from 'node:path'
import { createRequestHandler } from 'react-router'

const log = getLogger('hono')

function clientStaticRoot(clientBuildPath: string): string {
  const root = seaVfsRoot()
  return root === null ? clientBuildPath : join(root, SEA_CLIENT_ASSET_PREFIX)
}

interface HonoNodeServerOptions<E extends Env = BlankEnv> extends HonoServerOptionsBase<E> {
  listeningListener?: (info: AddressInfo) => void
  customNodeServer?: CreateNodeServerOptions
  onServe?: (server: ServerType) => void
  overrideGlobalObjects?: boolean
  hostname?: string
  serveStaticOptions?: {
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
        log.info('🚀 Server started', { port: info.port })
        log.info('🌍 Local server URL', { url: `http://127.0.0.1:${info.port}` })

        if (basename !== '/') {
          log.info('🔗 Local server URL with site basename', {
            url: `http://127.0.0.1:${info.port}${basename}`,
            basename,
          })
        }

        log.info('🏎️ Server startup timing', { startupMs: Date.now() - startTime })
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
    const baseServeOptions = {
      fetch: app.fetch.bind(app),
      port: mergedOptions.port,
      overrideGlobalObjects: mergedOptions.overrideGlobalObjects,
      hostname: mergedOptions.hostname,
    }
    const server = serve(
      mergedOptions.customNodeServer === undefined
        ? {
            ...baseServeOptions,
            serverOptions: {
              headersTimeout: 20_000,
              connectionsCheckingInterval: 10_000,
              requestTimeout: 0,
            },
          }
        : { ...baseServeOptions, ...mergedOptions.customNodeServer },
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
