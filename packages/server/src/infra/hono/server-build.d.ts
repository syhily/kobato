declare module 'virtual:react-router/server-build' {
  import type { ServerBuild } from 'react-router'

  export const assets: ServerBuild['assets']
  export const assetsBuildDirectory: ServerBuild['assetsBuildDirectory']
  export const basename: ServerBuild['basename']
  export const entry: ServerBuild['entry']
  export const future: ServerBuild['future']
  export const isSpaMode: ServerBuild['isSpaMode']
  export const prerender: ServerBuild['prerender']
  export const publicPath: ServerBuild['publicPath']
  export const routeDiscovery: ServerBuild['routeDiscovery']
  export const routes: ServerBuild['routes']
  export const ssr: ServerBuild['ssr']
  export const unstable_apiOnly: ServerBuild['unstable_apiOnly']
  export const unstable_apiServerOrigin: ServerBuild['unstable_apiServerOrigin']
  export const allowedActionOrigins: ServerBuild['allowedActionOrigins']
  export const unstable_getCriticalCss: ServerBuild['unstable_getCriticalCss']
}
