import type { ServerType } from '@hono/node-server'
import type { Hono } from 'hono'
import type { BlankEnv } from 'hono/types'
import type { AddressInfo } from 'node:net'

import { serve } from '@hono/node-server'
import { serverConfig } from '@kobato/server/infra/config'

export interface ListenHonoOptions<E extends BlankEnv> {
  app: Hono<E>
  onListening: (info: AddressInfo) => void
}

export function listenHono<E extends BlankEnv>(options: ListenHonoOptions<E>): ServerType {
  return serve(
    {
      fetch: options.app.fetch.bind(options.app),
      port: serverConfig.server.port,
      hostname: serverConfig.server.host,
      overrideGlobalObjects: false,
    },
    options.onListening,
  )
}
