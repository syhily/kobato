import type { Context, Env, Hono } from 'hono'
import type { RouterContextProvider, ServerBuild } from 'react-router'

export type ReactRouterHonoServerAppLoadContext = RouterContextProvider

export interface HonoServerOptionsBase<E extends Env> {
  /** Base Hono app replacing the default; the React Router server mounts on the `basename` path. */
  app?: Hono<E>
  /**
   * Automatically start the HTTP server in production mode; set `false` when
   * the caller manages the `serve()` lifecycle. @default true
   */
  autoServe?: boolean
  /** Port to start the server on (default `PORT || 3000`). */
  port?: number
  /**
   * Augment the React Router AppLoadContext; declare the module and enable
   * the `v8_middleware` future flag for the typings.
   */
  getLoadContext?: (
    c: Context<E>,
    options: {
      build: ServerBuild
      mode: string
    },
  ) => Promise<ReactRouterHonoServerAppLoadContext> | ReactRouterHonoServerAppLoadContext
  /** Middleware hook running before any built-in middleware, including asset serving. */
  beforeAll?: (app: Hono<E>) => Promise<void> | void
  /** Middleware hook applied after the default middleware and before the React Router middleware. */
  configure?: (app: Hono<E>) => Promise<void> | void
}
