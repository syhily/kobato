import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import { defineConfig } from 'vitest/config'

import { INKLING_ALIASES } from './vite-aliases'

export default defineConfig({
  plugins: [svgr(), react()],
  define: {
    __APP_VERSION__: JSON.stringify('development'),
  },
  resolve: {
    alias: INKLING_ALIASES,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    server: {
      deps: {
        // @testing-library/jest-dom's vitest entry imports 'vitest' — if it
        // is externalized, Node resolves that import from the workspace root
        // (a different vitest major) instead of this package's, splitting the
        // snapshot/expect singletons. Inline it so the import resolves through
        // vitest's own plugin resolver.
        inline: ['@testing-library/jest-dom'],
      },
    },
    include: [
      './test/unit/**/*.test.{js,jsx,ts,tsx}',
      './test/utils/**/*.test.{js,jsx,ts,tsx}',
      './test/clean-basic-html/**/*.test.{js,jsx,ts,tsx}',
      './test/html-api/**/*.test.{js,jsx,ts,tsx}',
      './test/html-to-lexical/**/*.test.{js,jsx,ts,tsx}',
      './test/html-renderer/**/*.test.{js,jsx,ts,tsx}',
      './test/markdown/**/*.test.{js,jsx,ts,tsx}',
      './test/transforms/**/*.test.{js,jsx,ts,tsx}',
      './test/nodes-base/**/*.test.{js,jsx,ts,tsx}',
    ],
    exclude: ['./test/acceptance/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'cobertura'],
      include: ['src/**'],
      thresholds: { lines: 56.17, functions: 54.12, branches: 49.91, statements: 56.16 },
    },
  },
})
