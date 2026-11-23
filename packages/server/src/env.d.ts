/// <reference types="@kobato/inkling/types" />

interface ImportMetaEnv {
  readonly REACT_ROUTER_HONO_SERVER_BUILD_DIRECTORY: string
  readonly REACT_ROUTER_HONO_SERVER_ASSETS_DIR: string
  readonly REACT_ROUTER_HONO_SERVER_BASENAME: string
}

declare module '@hono/node-server/serve-static' {
  type ServeStaticOptions<E extends import('hono').Env = import('hono').Env> = import('hono').ServeStaticOptions<E>
  export type { ServeStaticOptions }
  const serveStatic: <E extends import('hono').Env = any>(
    options?: ServeStaticOptions<E>,
  ) => import('hono').MiddlewareHandler<E>
  export { serveStatic }
}
