import type { ServerType } from '@hono/node-server'
import type { Env } from '@kobato/server/http/hono-env'

import { serveStatic } from '@hono/node-server/serve-static'
import { configureMiddleware } from '@kobato/server/http/middleware-pipeline'
import { cache } from '@kobato/server/http/middlewares/cache'
import { createSpaShellHandler } from '@kobato/server/http/spa-shell'
import { listenHono } from '@kobato/server/infra/http/listener'
import { root } from '@kobato/server/infra/logger'
import { buildCspHeader, siteUsesHttps } from '@kobato/settings/csp'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters'
import { Hono } from 'hono'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ASSET_CACHE_SECONDS = 60 * 60 * 24 * 365

export function createKobatoApp(assetsRoot: string): Hono<Env> {
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

  return app
}

export function listenKobato(app: Hono<Env>): ServerType {
  return listenHono({
    app,
    onListening: (info) => {
      root.info({ port: info.port }, '🚀 Backend server started')
      root.info({ url: `http://127.0.0.1:${info.port}` }, '🌍 Local server URL')
    },
  })
}
