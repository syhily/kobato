import { vitestTestBase } from '@kobato/test/vitest.base.ts'
import { testDefine } from '@kobato/test/vitest.define.ts'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import svgr from 'vite-plugin-svgr'
import { defineConfig } from 'vitest/config'

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))

export default defineConfig({
  root: REPO_ROOT,
  plugins: [svgr(), react({ compiler: true })],
  resolve: {
    tsconfigPaths: true,
  },
  define: testDefine,
  test: {
    ...vitestTestBase,
    name: 'demo-unit',
    pool: 'vmThreads',
    environment: 'jsdom',
    setupFiles: ['@kobato/test/setup/unit.ts'],
    include: ['apps/inkling-demo/tests/unit/**/*.test.{ts,tsx}'],
  },
})
