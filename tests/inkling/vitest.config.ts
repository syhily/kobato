import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import { defineConfig } from 'vitest/config'

import { testDefine } from '../vitest.define.ts'

// The inkling editor suite (src/inkling): jsdom + RTL, compiled through the
// React Compiler like the app bundle. Kept as its own project because the
// root unit project is node-env; globals stay off like the other projects.
export default defineConfig({
  plugins: [svgr(), react({ compiler: true })],
  resolve: {
    tsconfigPaths: true,
  },
  define: testDefine,
  test: {
    globals: false,
    silent: 'passed-only',
    environment: 'jsdom',
    setupFiles: ['./setup.ts'],
    server: {
      deps: {
        // @testing-library/jest-dom's vitest entry imports 'vitest' — if it
        // is externalized, Node resolves that import outside vitest's own
        // plugin resolver, splitting the snapshot/expect singletons and
        // breaking every toMatchSnapshot. Keep it inlined.
        inline: ['@testing-library/jest-dom'],
      },
    },
    include: [
      './unit/**/*.test.{js,jsx,ts,tsx}',
      './utils/**/*.test.{js,jsx,ts,tsx}',
      './clean-basic-html/**/*.test.{js,jsx,ts,tsx}',
      './html-api/**/*.test.{js,jsx,ts,tsx}',
      './html-to-lexical/**/*.test.{js,jsx,ts,tsx}',
      './html-renderer/**/*.test.{js,jsx,ts,tsx}',
      './markdown/**/*.test.{js,jsx,ts,tsx}',
      './transforms/**/*.test.{js,jsx,ts,tsx}',
      './nodes-base/**/*.test.{js,jsx,ts,tsx}',
    ],
    testTimeout: 10_000,
  },
})
