import type { BlankEnv } from 'hono/types'
import type { AddressInfo } from 'node:net'

import { type ServerType, serve } from '@hono/node-server'
import { type ServeStaticOptions, serveStatic } from '@hono/node-server/serve-static'
import { type Env, Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { createRequestHandler } from 'react-router'

import type { HonoServerOptionsBase } from '@/server/infra/hono/types/hono-server-options-base'
import type { CreateNodeServerOptions } from '@/server/infra/hono/types/node.https'

import { bindIncomingRequestSocketInfo, getBuildMode, importBuild } from '@/server/infra/hono/helpers'
import { cache } from '@/server/infra/hono/middleware'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('hono')

interface HonoNodeServerOptions<E extends Env = BlankEnv> extends HonoServerOptionsBase<E> {
  /**
   * Listening listener (production mode only)
   *
   * It is called when the server is listening
   *
   * Defaults log the port
   */
  listeningListener?: (info: AddressInfo) => void
  /**
   * Customize the node server (ex: using http2)
   *
   * {@link https://hono.dev/docs/getting-started/nodejs#http2}
   */
  customNodeServer?: CreateNodeServerOptions
  /**
   * Callback executed just after `serve` from `@hono/node-server`
   */
  onServe?: (server: ServerType) => void
  /**
   * The Node.js Adapter rewrites the global Request/Response and uses a lightweight Request/Response to improve performance.
   *
   * If you this behavior, set it to `true`
   *
   * 🚨 Setting this to `true` can break `request.clone()` if you later check `instanceof Request`.
   *
   * {@link https://github.com/honojs/node-server?tab=readme-ov-file#overrideglobalobjects}
   *
   * @default false
   */
  overrideGlobalObjects?: boolean
  /**
   * Customize the hostname of the node server
   */
  hostname?: string
  /**
   * Customize the serve static options
   */
  serveStaticOptions?: {
    /**
     * Customize the public assets (what's in your `public` directory) serve static options.
     *
     */
    publicAssets?: Omit<ServeStaticOptions<E>, 'root'>
    /**
     * Customize the client assets (what's in your `build/client/assets` directory - React Router) serve static options.
     *
     */
    clientAssets?: Omit<ServeStaticOptions<E>, 'root'>
  }
}

export type HonoServerOptions<E extends Env = BlankEnv> = HonoNodeServerOptions<E>

/**
 * Create a Hono server
 *
 * @param config {@link HonoServerOptions} - The configuration options for the server
 */
export async function createHonoServer<E extends Env = BlankEnv>(options?: HonoServerOptions<E>) {
  const startTime = Date.now()
  const build = await importBuild()
  const basename = import.meta.env.REACT_ROUTER_HONO_SERVER_BASENAME
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
    port: options?.port || Number(process.env.PORT) || 3000,
    overrideGlobalObjects: options?.overrideGlobalObjects ?? false,
  }
  const mode = getBuildMode()
  const PRODUCTION = mode === 'production'
  const clientBuildPath = `${import.meta.env.REACT_ROUTER_HONO_SERVER_BUILD_DIRECTORY}/client`
  const app = new Hono<E>(mergedOptions.app)

  if (!PRODUCTION) {
    app.use(bindIncomingRequestSocketInfo())
  }

  /**
   * Add optional middleware that runs before any built-in middleware, including assets serving.
   */
  await mergedOptions.beforeAll?.(app)

  /**
   * Serve assets files from build/client/assets
   */
  app.use(
    `/${import.meta.env.REACT_ROUTER_HONO_SERVER_ASSETS_DIR}/*`,
    cache(60 * 60 * 24 * 365), // 1 year
    serveStatic({ root: clientBuildPath, ...mergedOptions.serveStaticOptions?.clientAssets }),
  )

  /**
   * Serve public files
   */
  app.use(
    '*',
    cache(60 * 60), // 1 hour
    serveStatic({ root: PRODUCTION ? clientBuildPath : './public', ...mergedOptions.serveStaticOptions?.publicAssets }),
  )

  /**
   * Add optional middleware
   */
  await mergedOptions.configure?.(app)

  /**
   * Create a React Router Hono app and bind it to the root Hono server using the React Router basename
   */
  const reactRouterApp = new Hono<E>({
    strict: false,
  })

  reactRouterApp.use((c, next) => {
    return createMiddleware(async (c) => {
      const requestHandler = createRequestHandler(build, mode)
      const loadContext = mergedOptions.getLoadContext?.(c, { build, mode })
      return requestHandler(c.req.raw, loadContext instanceof Promise ? await loadContext : loadContext)
    })(c, next)
  })

  app.route(`${basename}`, reactRouterApp)

  // Patch https://github.com/remix-run/react-router/issues/12295
  if (basename) {
    app.route(`${basename}.data`, reactRouterApp)
  }

  /**
   * Start the production server
   */
  if (PRODUCTION) {
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
    // Execute your onServe callback. Use case: socket.io binding
    mergedOptions.onServe?.(server)
  } else if (globalThis.__viteDevServer?.httpServer) {
    const httpServer = globalThis.__viteDevServer.httpServer

    // Execute your onServe callback. Use case: socket.io binding
    mergedOptions.onServe?.(httpServer)

    log.info('🚧 Dev server started')
  }

  return app
}
