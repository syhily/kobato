import type { HonoServerOptionsBase } from '@kobato/server/infra/hono/types/hono-server-options-base'
import type { CreateNodeServerOptions } from '@kobato/server/infra/hono/types/node.https'
import type { BlankEnv } from 'hono/types'
import type { AddressInfo } from 'node:net'

import { type ServerType, serve } from '@hono/node-server'
import { type ServeStaticOptions, serveStatic } from '@hono/node-server/serve-static'
import { serverConfig } from '@kobato/server/infra/config'
import { getViteDevServer } from '@kobato/server/infra/hono/dev-server-ref'
import { bindIncomingRequestSocketInfo, getBuildMode, importBuild } from '@kobato/server/infra/hono/helpers'
import { cache } from '@kobato/server/infra/hono/middleware'
import { getLogger } from '@kobato/server/infra/logger'
import { getEmbeddedAsset, isSea } from '@kobato/server/infra/sea'
import { SEA_CLIENT_ASSET_PREFIX } from '@kobato/shared/sea/assets'
import { type Env, Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { getMimeType } from 'hono/utils/mime'
import { createRequestHandler } from 'react-router'

const log = getLogger('hono')

/**
 * SEA-mode replacement for `serveStatic` on the fingerprinted client
 * assets: the `build/client` tree is embedded in the binary, so files are
 * read from memory instead of disk. A miss mirrors serveStatic's behavior
 * (`next()`), letting later middleware / the stale-chunk guard handle it.
 */
const serveEmbeddedStatic = createMiddleware(async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    return next()
  }
  // The handler only runs under the `/<assetsDir>/*` mount, so the
  // request path maps 1:1 onto the embedded `client/assets/...` keys
  // (the leading `/` of the path makes room for the prefix).
  // Unresolvable paths (traversal attempts included) simply match no key.
  const asset = getEmbeddedAsset(`${SEA_CLIENT_ASSET_PREFIX}${c.req.path.slice(1)}`)
  if (asset === null) {
    return next()
  }
  c.header('Content-Type', getMimeType(c.req.path) ?? 'application/octet-stream')
  c.header('Content-Length', String(asset.byteLength))
  if (c.req.method === 'HEAD') {
    return c.body(null, 200)
  }
  return c.body(new Uint8Array(asset), 200)
})

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
  const basename = String(import.meta.env.REACT_ROUTER_HONO_SERVER_BASENAME ?? '/')
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
   *
   * Only mounted in production: in development Vite's dev server handles
   * asset serving and the `build/client` directory does not exist yet.
   */
  if (PRODUCTION) {
    const assetsPath = `/${import.meta.env.REACT_ROUTER_HONO_SERVER_ASSETS_DIR}/*`
    if (isSea()) {
      // Single-executable build: client assets are embedded in the binary
      // (keys `client/assets/...`), nothing to read from disk.
      app.use(assetsPath, cache(60 * 60 * 24 * 365), serveEmbeddedStatic)
    } else {
      app.use(
        assetsPath,
        cache(60 * 60 * 24 * 365), // 1 year
        serveStatic({ root: clientBuildPath, ...mergedOptions.serveStaticOptions?.clientAssets }),
      )
    }
  }

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

  /**
   * Start the production server
   */
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
