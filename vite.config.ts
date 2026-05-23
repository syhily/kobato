import type { Plugin, PluginOption } from 'vite'

import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { DevToolsRolldownUI } from '@vitejs/devtools-rolldown'
import { defineConfig } from 'vite'

import { reactRouterHonoServer } from './src/server/infra/hono/dev.ts'

export default defineConfig({
  plugins: [
    reactRouterHonoServer(),
    ...(reactRouter() as Plugin[]),
    tailwindcss(),
    DevToolsRolldownUI(),
  ] as PluginOption[],
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    emptyOutDir: true,
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      devtools: {},
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
  server: {
    port: 4321,
    warmup: {
      clientFiles: ['./src/root.tsx', './src/routes.ts', './src/routes/**/*.{ts,tsx}'],
    },
  },
})
