import type { Plugin, PluginOption } from 'vite'

import { inlinePackageDataPlugin } from '@kobato/pack/sea/inline-package-data'
import { appDefines, readAppPackage } from '@kobato/pack/vite/app-metadata'
import { appOptimizeDeps } from '@kobato/pack/vite/optimize-deps'
import { reactCompilerPlugin } from '@kobato/pack/vite/react-compiler-plugin'
import { sanitizeEngineAliasPlugin } from '@kobato/pack/vite/sanitize-engine-alias'
import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import svgr from 'vite-plugin-svgr'

const BACKEND_URL_ENV = 'KOBATO_DEV_BACKEND_URL'
const DEFAULT_BACKEND_URL = 'http://127.0.0.1:4320'

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

export default defineConfig(({ command, isPreview }) => {
  const backendUrl = process.env[BACKEND_URL_ENV] ?? DEFAULT_BACKEND_URL
  const proxyRule = { target: backendUrl, changeOrigin: true }
  return {
    base: isPreview ? '/' : '/admin/',
    ...(command === 'build'
      ? {
          ssr: {
            noExternal: true,
            target: 'node',
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
      ...(reactRouter() as Plugin[]),
      tailwindcss(),
      svgr(),
    ] as PluginOption[],
    resolve: {
      tsconfigPaths: true,
    },
    optimizeDeps: appOptimizeDeps('packages/web/admin'),
    build: {
      emptyOutDir: true,
      chunkSizeWarningLimit: 500,
    },
    define: appDefines(readAppPackage()),
    server: {
      host: '127.0.0.1',
      port: 4321,
      proxy: {
        '/rpc': proxyRule,
        '/health': proxyRule,
        '/ready': proxyRule,
      },
      warmup: {
        clientFiles: ['./src/root.tsx', './src/routes.ts', './src/routes/**/*.{ts,tsx}'],
      },
    },
  }
})
