import type { Plugin, PluginOption } from 'vite'

import { inlinePackageDataPlugin } from '@kobato/pack/sea/inline-package-data'
import { appDefines, readAppPackage } from '@kobato/pack/vite/app-metadata'
import { appOptimizeDeps } from '@kobato/pack/vite/optimize-deps'
import { reactCompilerPlugin } from '@kobato/pack/vite/react-compiler-plugin'
import { routeWarmupPlugin } from '@kobato/pack/vite/route-warmup'
import { sanitizeEngineAliasPlugin } from '@kobato/pack/vite/sanitize-engine-alias'
import { reactRouterHonoServer } from '@kobato/server/infra/hono/dev'
import { processWorkerEntryPlugin } from '@kobato/server/infra/image/worker-entry-plugin'
import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import svgr from 'vite-plugin-svgr'

export default defineConfig(({ command }) => ({
  ...(command === 'build'
    ? {
        ssr: {
          noExternal: true,
          target: 'node',
          external: ['sharp', '@napi-rs/canvas', '@duckdb/node-api'],
        },
      }
    : {}),
  environments: {
    client: {
      build: {
        chunkSizeWarningLimit: 2500,
      },
    },
    ssr: {
      resolve: {
        conditions: ['node'],
      },
      ...(command === 'build'
        ? {
            build: {
              emitAssets: true,
              rolldownOptions: {
                input: 'src/server.ts',
              },
            },
          }
        : {}),
    },
  },
  plugins: [
    sanitizeEngineAliasPlugin(),
    inlinePackageDataPlugin(),
    reactCompilerPlugin(),
    reactRouterHonoServer(),
    ...(reactRouter() as Plugin[]),
    tailwindcss(),
    svgr(),
    processWorkerEntryPlugin(),
    routeWarmupPlugin(),
  ] as PluginOption[],
  resolve: {
    tsconfigPaths: true,
  },
  optimizeDeps: appOptimizeDeps(),
  build: {
    emptyOutDir: true,
    chunkSizeWarningLimit: 500,
  },
  define: appDefines(readAppPackage()),
  server: {
    port: 4321,
    warmup: {
      clientFiles: ['./src/root.tsx', './src/routes.ts', './src/routes/**/*.{ts,tsx}'],
    },
  },
}))
