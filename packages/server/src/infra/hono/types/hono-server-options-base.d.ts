import type { Context, Env, Hono } from 'hono'
import type { RouterContextProvider, ServerBuild } from 'react-router'

export type ReactRouterHonoServerAppLoadContext = RouterContextProvider

export interface HonoServerOptionsBase<E extends Env> {
  app?: Hono<E>
  autoServe?: boolean
  port?: number
  getLoadContext?: (
    c: Context<E>,
    options: {
      build: ServerBuild
      mode: string
    },
  ) => Promise<ReactRouterHonoServerAppLoadContext> | ReactRouterHonoServerAppLoadContext
  beforeAll?: (app: Hono<E>) => Promise<void> | void
  configure?: (app: Hono<E>) => Promise<void> | void
}
