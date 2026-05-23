import type { ViteDevServer } from 'vite'

let viteDevServer: ViteDevServer | undefined

export function setViteDevServer(server: ViteDevServer | undefined): void {
  viteDevServer = server
}

export function getViteDevServer(): ViteDevServer | undefined {
  return viteDevServer
}
