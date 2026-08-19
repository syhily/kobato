/// <reference types="node" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly REACT_ROUTER_HONO_SERVER_BUILD_DIRECTORY: string
  readonly REACT_ROUTER_HONO_SERVER_ASSETS_DIR: string
  readonly REACT_ROUTER_HONO_SERVER_BASENAME: string
}

import type { ViteDevServer } from 'vite'

declare global {
  var __viteDevServer: ViteDevServer | undefined
  const __APP_NAME__: string
  const __APP_VERSION__: string
  const __APP_DESCRIPTION__: string
  const __APP_AUTHOR_NAME__: string
  const __APP_HOMEPAGE__: string
  const __APP_REPOSITORY__: string
}

declare module '@hono/node-server/serve-static' {
  import type { MiddlewareHandler, ServeStaticOptions } from 'hono'
  const serveStatic: (options?: ServeStaticOptions) => MiddlewareHandler
  export { serveStatic }
}
