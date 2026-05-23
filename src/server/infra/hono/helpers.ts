import type { Env } from 'hono'
import type { IncomingMessage } from 'node:http'
import type { ServerBuild } from 'react-router'

import { createMiddleware } from 'hono/factory'

import type { HonoServerOptionsBase } from '@/server/infra/hono/types/hono-server-options-base'

type SocketInfo = Partial<IncomingMessage['socket']>

/**
 * Bind socket info from the headers to the Hono context
 *
 * Unlock the usage of https://hono.dev/docs/helpers/conninfo in dev
 */
export function bindIncomingRequestSocketInfo() {
  return createMiddleware((c, next) => {
    c.env.server = {
      incoming: {
        socket: {
          remoteAddress: c.req.raw.headers.get('x-remote-address') || undefined,
          remotePort: Number(c.req.raw.headers.get('x-remote-port')) || undefined,
          remoteFamily: c.req.raw.headers.get('x-remote-family') || undefined,
        } satisfies SocketInfo,
      },
    }

    return next()
  })
}

/**
 * Import React Router server build
 */
export async function importBuild(): Promise<ServerBuild> {
  // oxlint-disable-next-line typescript/return-await
  return await import('virtual:react-router/server-build')
}

/**
 * Helper to create a getLoadContext function fully typed
 */
export function createGetLoadContext(getLoadContext: HonoServerOptionsBase<Env>['getLoadContext']) {
  return getLoadContext
}

/**
 * Get the build mode from the environment
 */
export function getBuildMode() {
  return import.meta.env.DEV ? 'development' : 'production'
}
