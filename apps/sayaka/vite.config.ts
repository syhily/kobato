import type { Plugin, PluginOption } from 'vite'

import { inlinePackageDataPlugin } from '@kobato/pack/sea/inline-package-data'
import { appDefines, readAppPackage } from '@kobato/pack/vite/app-metadata'
import { reactCompilerPlugin } from '@kobato/pack/vite/react-compiler-plugin'
import { reactRouterHonoServer } from '@kobato/pack/vite/react-router-hono-server'
import { routeWarmupPlugin } from '@kobato/pack/vite/route-warmup'
import { sanitizeEngineAliasPlugin } from '@kobato/pack/vite/sanitize-engine-alias'
import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  ...(command === 'build'
    ? {
        ssr: {
          noExternal: true,
          target: 'node',
          external: ['@napi-rs/canvas'],
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
    routeWarmupPlugin({
      tier1Routes: ['root', 'routes/layout', 'routes/home'],
      tier2Prefixes: [['routes/', 'public']],
      warmupEntry: fileURLToPath(new URL('./src/route-warmup/idle-script.entry.ts', import.meta.url)),
    }),
  ] as PluginOption[],
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    emptyOutDir: true,
    chunkSizeWarningLimit: 500,
  },
  define: appDefines(readAppPackage('apps/sayaka')),
  server: {
    port: 4322,
    warmup: {
      clientFiles: ['./src/root.tsx', './src/routes.ts', './src/routes/**/*.{ts,tsx}'],
    },
  },
}))
