import type { Env } from 'hono'
import type { IncomingMessage } from 'node:http'
import type { ServerBuild } from 'react-router'

import { createMiddleware } from 'hono/factory'

type SocketInfo = Partial<IncomingMessage['socket']>

interface SocketEnv extends Env {
  Bindings: {
    server?: {
      incoming: {
        socket: SocketInfo
      }
    }
  }
}

/** Unlocks hono's conninfo helper in dev. */
export function bindIncomingRequestSocketInfo() {
  return createMiddleware<SocketEnv>((c, next) => {
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

export async function importBuild(): Promise<ServerBuild> {
  return import('virtual:react-router/server-build')
}

export function getBuildMode() {
  return import.meta.env.DEV ? 'development' : 'production'
}
