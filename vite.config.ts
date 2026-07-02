import type { Plugin, PluginOption } from 'vite'

import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import Binary from 'vite-plugin-binary'
import svgr from 'vite-plugin-svgr'
import { z } from 'zod'

import { reactRouterHonoServer } from './src/server/infra/hono/dev.ts'
import { processWorkerEntryPlugin } from './src/server/infra/image/worker-entry-plugin'
import { routeWarmupPlugin } from './src/server/infra/route-warmup'

const pkgSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  author: z.object({ name: z.string() }),
  homepage: z.string(),
  repository: z.object({ url: z.string() }),
})

const pkg = pkgSchema.parse(JSON.parse(readFileSync('./package.json', 'utf-8')))

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({ command }) => ({
  ssr:
    command === 'serve'
      ? {
          // emoji-mart ships ESM only under its `module` field (no `exports`
          // map), so Node's externalized SSR resolution falls back to the CJS
          // `main` and named imports fail. Bundling them into the dev SSR
          // graph lets Vite pick the ESM build (prod build is noExternal).
          noExternal: ['emoji-mart', '@emoji-mart/react'],
        }
      : {
          noExternal: true,
          target: 'node',
          external: ['sharp', '@napi-rs/canvas'],
        },
  environments:
    command === 'build'
      ? {
          ssr: {
            build: {
              rollupOptions: {
                input: 'src/server.ts',
              },
            },
          },
        }
      : undefined,
  plugins: [
    reactRouterHonoServer(),
    Binary({ gzip: false, excludeAsset: true }),
    // `?react` SVG imports used by the vendored editor source (src/ui/inkling-editor).
    svgr(),
    ...(reactRouter() as Plugin[]),
    tailwindcss(),
    processWorkerEntryPlugin(),
    routeWarmupPlugin(),
  ] as PluginOption[],
  resolve: {
    tsconfigPaths: true,
    alias: {
      '@': resolve(projectRoot, 'src'),
      '#': resolve(projectRoot, 'tests'),
      // y-websocket (vendored editor's multiplayer transport) imports Node's
      // `events`, which Vite externalizes to an empty shim in the browser —
      // clicking into the editor route then dies on `events.EventEmitter`.
      // Same alias the upstream inkling repo uses.
      events: 'eventemitter3',
    },
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
  assetsInclude: ['**/*.wasm', '**/*.wasm?binary'],
}))
