import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import svgr from 'vite-plugin-svgr'

const require = createRequire(import.meta.url)

export default defineConfig({
  plugins: [react({ compiler: true }), tailwindcss(), svgr()],
  resolve: {
    alias: {
      '@kobato/inkling-demo': resolve(import.meta.dirname, '.'),
      '@kobato/inkling/headless$': resolve(import.meta.dirname, '../../packages/inkling/src/headless/index.ts'),
      '@kobato/inkling': resolve(import.meta.dirname, '../../packages/inkling/src'),
      '@kobato/web-public': resolve(import.meta.dirname, '../../packages/web/public/src'),
      '@kobato/ui': resolve(import.meta.dirname, '../../packages/ui/src'),
      // Prevents double-bundling of yjs due to cjs/esm mismatch
      // (see https://github.com/facebook/lexical/issues/2153).
      yjs: require.resolve('yjs/src/index.js'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify('development'),
  },
  server: {
    allowedHosts: true,
    port: 4322,
  },
  preview: {
    allowedHosts: true,
  },
})
