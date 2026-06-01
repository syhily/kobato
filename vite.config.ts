import type { Plugin, PluginOption } from 'vite'

import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { createRequire } from 'node:module'
import { defineConfig } from 'vite'
import babel from 'vite-plugin-babel'

import { reactRouterHonoServer } from './src/server/infra/hono/dev.ts'
import { routeWarmupPlugin } from './src/server/infra/route-warmup'

const require = createRequire(import.meta.url)
const pkg = require('./package.json')

export default defineConfig({
  plugins: [
    reactRouterHonoServer(),
    ...(reactRouter() as Plugin[]),
    babel({
      include: /src\/.*\.[jt]sx?$/,
      babelConfig: {
        presets: ['@babel/preset-typescript'],
        plugins: [['babel-plugin-react-compiler', {}]],
      },
    }),
    tailwindcss(),
    routeWarmupPlugin(),
  ] as PluginOption[],
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    emptyOutDir: true,
    chunkSizeWarningLimit: 500,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@tiptap/') || id.includes('node_modules/prosemirror-')) {
            return 'editor-tiptap'
          }
          if (id.includes('node_modules/@napi-rs/canvas')) {
            return 'canvas'
          }
          return undefined
        },
      },
    },
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
