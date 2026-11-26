import type { Plugin, PluginOption } from 'vite'

import { inlinePackageDataPlugin } from '@kobato/pack/sea/inline-package-data'
import { appDefines, readAppPackage } from '@kobato/pack/vite/app-metadata'
import { appOptimizeDeps } from '@kobato/pack/vite/optimize-deps'
import { reactCompilerPlugin } from '@kobato/pack/vite/react-compiler-plugin'
import { reactRouterHonoServer } from '@kobato/pack/vite/react-router-hono-server'
import { routeWarmupPlugin } from '@kobato/pack/vite/route-warmup'
import { sanitizeEngineAliasPlugin } from '@kobato/pack/vite/sanitize-engine-alias'
import { processWorkerEntryPlugin } from '@kobato/server/infra/image/worker-entry-plugin'
import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import svgr from 'vite-plugin-svgr'

function editorDocumentRewritePlugin(): Plugin {
  return {
    name: 'kobato-editor-document-rewrite',
    enforce: 'pre',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url ?? ''
        if (url === '/editor' || url.startsWith('/editor/')) {
          req.url = `/admin${url}`
        }
        next()
      })
    },
  }
}

export default defineConfig(({ command, isPreview }) => ({
  base: isPreview ? '/' : '/admin/',
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
    },
  },
  plugins: [
    editorDocumentRewritePlugin(),
    sanitizeEngineAliasPlugin(),
    inlinePackageDataPlugin(),
    reactCompilerPlugin(),
    reactRouterHonoServer({
      dev: {
        exclude: [/^\/admin($|\/|\?)/, /^\/editor($|\/|\?)/, /\.data($|\?)/],
      },
    }),
    ...(reactRouter() as Plugin[]),
    tailwindcss(),
    svgr(),
    processWorkerEntryPlugin(),
    routeWarmupPlugin({
      tier1Routes: ['root', 'routes/admin/layout', 'routes/admin/dashboard'],
      tier2Prefixes: [
        ['routes/admin/', 'admin'],
        ['routes/editor/', 'editor'],
        ['routes/auth/', 'auth'],
      ],
    }),
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
