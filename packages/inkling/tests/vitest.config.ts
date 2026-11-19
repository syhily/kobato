import { testDefine } from '@kobato/test/vitest.define.ts'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [svgr(), react({ compiler: true })],
  resolve: {
    tsconfigPaths: true,
  },
  define: testDefine,
  test: {
    name: 'inkling',
    globals: false,
    silent: 'passed-only',
    maxWorkers: 4,
    environment: 'jsdom',
    setupFiles: ['./setup.ts'],
    server: {
      deps: {
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
