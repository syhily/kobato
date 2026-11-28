import type { Plugin } from 'vite'

import { frontEndConfig } from '@kobato/pack/vite/front-end-config'
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

const backendUrl = process.env[BACKEND_URL_ENV] ?? DEFAULT_BACKEND_URL
const proxyRule = { target: backendUrl, changeOrigin: true }

export default defineConfig(
  frontEndConfig({
    appDir: 'apps/kobato',
    port: 4321,
    base: ({ isPreview }) => (isPreview ? '/' : '/admin/'),
    optimizeDeps: true,
    plugins: {
      leading: [editorDocumentRewritePlugin()],
      trailing: [svgr()],
    },
    server: {
      host: '127.0.0.1',
      proxy: {
        '/rpc': proxyRule,
        '/health': proxyRule,
        '/ready': proxyRule,
      },
    },
  }),
)
