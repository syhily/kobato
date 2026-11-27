import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin, ViteDevServer } from 'vite'

import honoDevServer from '@hono/vite-dev-server'
import nodeAdapter from '@hono/vite-dev-server/node'
import { unsafeCast } from '@kobato/base/utils/unsafe-cast'

export const VITE_DEV_SERVER_SLOT = Symbol.for('kobato.vite-dev-server')
const DEV_HOST_MARKER = Symbol.for('kobato.server.dev-host')

export function exposeViteDevServer(server: ViteDevServer): void {
  Reflect.set(globalThis, VITE_DEV_SERVER_SLOT, server)
}

export function markDevHost(): void {
  Reflect.set(globalThis, DEV_HOST_MARKER, true)
}

export function remoteAddressMiddleware() {
  return (req: IncomingMessage, _res: ServerResponse, next: () => void) => {
    req.rawHeaders.push('x-remote-address', req.socket.remoteAddress || 'unknown')
    req.rawHeaders.push('x-remote-port', String(req.socket.remotePort || 'unknown'))
    req.rawHeaders.push('x-remote-family', req.socket.remoteFamily || 'unknown')
    next()
  }
}

async function applyHonoDevServer(plugin: Plugin, server: ViteDevServer): Promise<void> {
  if (typeof plugin.configureServer === 'function') {
    await unsafeCast<(server: ViteDevServer) => void | Promise<void>>(plugin.configureServer)(server)
    return
  }
  throw new Error('Cannot apply dev server plugin configureServer hook')
}

export interface HonoDevHostOptions {
  entry: string
}

export function honoDevHost(options: HonoDevHostOptions): Plugin {
  const devServerPlugin = honoDevServer({
    adapter: nodeAdapter,
    injectClientScript: false,
    entry: options.entry,
    export: 'default',
    exclude: [/^\/@/, /^\/node_modules\//, /^\/\.vite\//, /\?import(\?.*)?$/],
  })

  return {
    name: 'kobato-hono-dev-host',
    enforce: 'post',
    configureServer(server) {
      forceDevMode()
      exposeViteDevServer(server)
      markDevHost()
      server.middlewares.use(remoteAddressMiddleware())
      return applyHonoDevServer(devServerPlugin, server)
    },
  }
}

export function forceDevMode(): void {
  if (process.env.NODE_ENV !== 'test') {
    process.env.NODE_ENV = 'development'
  }
}
