import type { Plugin, PluginOption } from 'vite'

import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { createRequire } from 'node:module'
import { defineConfig } from 'vite'

import { reactRouterHonoServer } from './src/server/infra/hono/dev.ts'
import { routeWarmupPlugin } from './src/server/infra/route-warmup'

const require = createRequire(import.meta.url)
const pkg = require('./package.json')

export default defineConfig({
  ssr: {
    noExternal: true,
    target: 'node',
    external: ['sharp', '@napi-rs/canvas'],
  },
  plugins: [
    reactRouterHonoServer(),
    ...(reactRouter() as Plugin[]),
    tailwindcss(),
    routeWarmupPlugin(),
  ] as PluginOption[],
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    emptyOutDir: true,
    chunkSizeWarningLimit: 500,
  },
  define: {
    __APP_NAME__: JSON.stringify(pkg.name),
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_DESCRIPTION__: JSON.stringify(pkg.description),
    __APP_AUTHOR_NAME__: JSON.stringify(pkg.author.name),
    __APP_HOMEPAGE__: JSON.stringify(pkg.homepage),
    __APP_REPOSITORY__: JSON.stringify(pkg.repository.url),
  },
  server: {
    port: 4321,
    warmup: {
      clientFiles: ['./src/root.tsx', './src/routes.ts', './src/routes/**/*.{ts,tsx}'],
    },
  },
})
