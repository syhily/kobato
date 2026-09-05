import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import svgr from 'vite-plugin-svgr'

import { INKLING_ALIASES, INKLING_BUNDLE_WORKAROUND_ALIASES } from './vite-aliases'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [svgr(), react(), tailwindcss()],
  base: '/',
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0'),
  },
  resolve: {
    alias: { ...INKLING_ALIASES, ...INKLING_BUNDLE_WORKAROUND_ALIASES },
  },
  build: {
    outDir: 'dist-demo',
    sourcemap: true,
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
      },
    },
  },
})
