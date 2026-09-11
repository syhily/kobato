import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import svgr from 'vite-plugin-svgr'

const require = createRequire(import.meta.url)

// The standalone inkling editor playground (`pnpm demo`). Self-contained on
// purpose: not part of the app build, the `type` pass, or the vitest run.
export default defineConfig({
  plugins: [react({ compiler: true }), tailwindcss(), svgr()],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, '../src'),
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
