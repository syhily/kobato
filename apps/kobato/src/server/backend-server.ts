import type { ServerType } from '@hono/node-server'
import type { Env } from '@kobato/server/http/hono-env'

import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { SEA_CLIENT_ASSET_PREFIX } from '@kobato/distribution/sea-assets'
import { configureMiddleware } from '@kobato/server/http/middleware-pipeline'
import { cache } from '@kobato/server/http/middlewares/cache'
import { serverConfig } from '@kobato/server/infra/config'
import { root } from '@kobato/server/infra/logger'
import { seaVfsRoot } from '@kobato/server/infra/sea/sea'
import { buildCspHeader, siteUsesHttps } from '@kobato/settings/csp'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters'
import { Hono } from 'hono'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { getViteDevServer } from '@/server/dev-server-ref'
import { createSpaShellHandler } from '@/server/spa-shell'

const ASSET_CACHE_SECONDS = 60 * 60 * 24 * 365

export function clientAssetsRoot(): string {
  const diskRoot = fileURLToPath(new URL('../client', import.meta.url))
  const vfsRoot = seaVfsRoot()
  return vfsRoot === null ? diskRoot : join(vfsRoot, SEA_CLIENT_ASSET_PREFIX.replace(/\/$/, ''))
}

export interface BackendServerOptions {
  assetsRoot?: string
  autoServe?: boolean
  onServe?: (server: ServerType) => void
}

export function createBackendServer(options?: BackendServerOptions): Hono<Env> {
  const assetsRoot = options?.assetsRoot ?? clientAssetsRoot()
  const app = new Hono<Env>()

  configureMiddleware(app)

  const shell = createSpaShellHandler({
    loadHtml: () => readFileSync(join(assetsRoot, 'index.html'), 'utf8'),
    buildCsp: (nonce) => buildCspHeader({ bundle: getBlogSettingsBundleSync(), nonce, isDev: import.meta.env.DEV }),
    isHttps: () => siteUsesHttps(getBlogSettingsBundleSync()),
  })

  app.on(
    ['GET', 'HEAD'],
    '/admin/assets/*',
    cache(ASSET_CACHE_SECONDS),
    serveStatic({
      root: assetsRoot,
      rewriteRequestPath: (path) => path.replace(/^\/admin/, ''),
    }),
  )
  app.all('/admin/assets/*', (c) => c.body(null, 404))

  app.on(['GET', 'HEAD'], '/admin', shell)
  app.on(['GET', 'HEAD'], '/admin/*', shell)
  app.on(['GET', 'HEAD'], '/editor/*', shell)

  app.all('*', (c) => c.body(null, 404))

  if (options?.autoServe !== false) {
    if (import.meta.env.PROD) {
      const server = serve(
        {
          fetch: app.fetch.bind(app),
          port: serverConfig.server.port,
          hostname: serverConfig.server.host,
          overrideGlobalObjects: false,
        },
        (info) => {
          root.info({ port: info.port }, '🚀 Backend server started')
          root.info({ url: `http://127.0.0.1:${info.port}` }, '🌍 Local server URL')
        },
      )
      options?.onServe?.(server)
    } else {
      const devServer = getViteDevServer()
      if (devServer?.httpServer) {
        options?.onServe?.(devServer.httpServer)
        root.info('🚧 Dev server started')
      }
    }
  }

  return app
}
