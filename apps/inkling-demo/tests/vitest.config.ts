import { REPO_ROOT } from '@kobato/test/repo-root'
import { vitestTestBase } from '@kobato/test/vitest.base'
import { testDefine } from '@kobato/test/vitest.define'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import { defineConfig } from 'vitest/config'

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
    setupFiles: ['@kobato/test/setup/unit'],
    include: ['apps/inkling-demo/tests/unit/**/*.test.{ts,tsx}'],
  },
})
