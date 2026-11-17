import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import svgr from 'vite-plugin-svgr'

const require = createRequire(import.meta.url)

// The standalone inkling editor playground (`pnpm demo`). Self-contained on
// purpose: not part of the app build, the `type` pass, or the vitest run.
// The aliases point straight at the workspace package sources because the
// playground reaches into inkling internals that the package's exports map
// deliberately does not expose.
export default defineConfig({
  plugins: [react({ compiler: true }), tailwindcss(), svgr()],
  resolve: {
    alias: {
      '@kobato/inkling/headless': resolve(import.meta.dirname, '../packages/inkling/src/headless.ts'),
      '@kobato/inkling': resolve(import.meta.dirname, '../packages/inkling/src'),
      '@kobato/web': resolve(import.meta.dirname, '../packages/web/src'),
      '@kobato/shared': resolve(import.meta.dirname, '../packages/shared/src'),
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
