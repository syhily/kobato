/// <reference types="vite/client" />

// Root-program ambient declarations. The app shells carry their own
// `env.d.ts` / `virtual-modules.d.ts` inside `apps/*/src` (they are checked
// by the per-app tsconfig programs), but the root program typechecks
// packages/tests/scripts — which use the same compile-time globals and
// virtual modules — without any app file in scope. The `__APP_*__` globals
// mirror the vite `define` block; `virtual:route-warmup-script` mirrors the
// routeWarmupPlugin; `virtual:react-router/server-build` mirrors the
// per-app typegen `+server-build.d.ts`. This file is a script (no top-level
// import/export), so the consts below are plain globals.

declare const __APP_NAME__: string
declare const __APP_VERSION__: string
declare const __APP_DESCRIPTION__: string
declare const __APP_AUTHOR_NAME__: string
declare const __APP_HOMEPAGE__: string
declare const __APP_REPOSITORY__: string

declare module 'virtual:route-warmup-script' {
  const script: string
  export default script
}

declare module 'virtual:react-router/server-build' {
  import { ServerBuild } from 'react-router'
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
  export const allowedActionOrigins: ServerBuild['allowedActionOrigins']
  export const unstable_getCriticalCss: ServerBuild['unstable_getCriticalCss']
}
