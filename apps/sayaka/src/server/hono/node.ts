import type { HonoServerOptionsBase } from '@sayaka/server/hono/types/hono-server-options-base.d.ts'
import type { CreateNodeServerOptions } from '@sayaka/server/hono/types/node.https.d.ts'
import type { BlankEnv } from 'hono/types'
import type { AddressInfo } from 'node:net'

import { type ServerType, serve } from '@hono/node-server'
import { type ServeStaticOptions, serveStatic } from '@hono/node-server/serve-static'
import { SEA_SAYAKA_CLIENT_ASSET_PREFIX } from '@kobato/base/distribution/sea-assets'
import { HTTP_SERVER_OPTIONS } from '@kobato/base/utils/http-server-options'
import { sayakaConfig } from '@sayaka/server/config'
import { bindIncomingRequestSocketInfo, getBuildMode, importBuild } from '@sayaka/server/hono/build-runtime'
import { cache } from '@sayaka/server/hono/cache-middleware'
import { getViteDevServer } from '@sayaka/server/hono/dev-server-ref'
import { getLogger } from '@sayaka/server/logger'
import { seaVfsRoot } from '@sayaka/server/sea'
import { type Env, Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequestHandler } from 'react-router'

const log = getLogger('hono')

export function clientAssetsRoot(): string {
  const diskRoot = fileURLToPath(new URL('../client', import.meta.url))
  const root = seaVfsRoot()
  return root === null ? diskRoot : join(root, SEA_SAYAKA_CLIENT_ASSET_PREFIX.replace(/\/$/, ''))
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
    port: options?.port || sayakaConfig.port,
    hostname: options?.hostname || sayakaConfig.host,
    overrideGlobalObjects: options?.overrideGlobalObjects ?? false,
  }
  const mode = getBuildMode()
  const PRODUCTION = mode === 'production'
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
        root: clientAssetsRoot(),
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
        ? { ...baseServeOptions, serverOptions: HTTP_SERVER_OPTIONS }
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
