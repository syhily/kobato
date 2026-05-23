/// <reference types="node" />
/// <reference types="vite/client" />

interface ReactRouterHonoServerEnv {
  readonly REACT_ROUTER_HONO_SERVER_BUILD_DIRECTORY: string
  readonly REACT_ROUTER_HONO_SERVER_ASSETS_DIR: string
  readonly REACT_ROUTER_HONO_SERVER_BASENAME: string
}

interface ImportMetaEnv extends ReactRouterHonoServerEnv {}

// hono-server global types

import type { ViteDevServer } from 'vite'

declare global {
  var __viteDevServer: ViteDevServer | undefined
}

declare module '@hono/node-server/serve-static' {
  import type { Env, MiddlewareHandler, ServeStaticOptions } from 'hono'
  const serveStatic: <E extends Env = Env>(options?: ServeStaticOptions<E>) => MiddlewareHandler
  export { serveStatic }
}
