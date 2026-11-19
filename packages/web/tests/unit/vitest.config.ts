import { testDefine } from '@kobato/test/vitest.define.ts'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

export default defineConfig({
  root: REPO_ROOT,
  resolve: {
    tsconfigPaths: true,
  },
  define: testDefine,
  test: {
    name: 'web-unit',
    globals: false,
    silent: 'passed-only',
    maxWorkers: 4,
    environment: 'node',
    include: [
      'packages/web/tests/unit/**/*.test.{ts,tsx}',
      'packages/web/tests/contract/**/*.test.{ts,tsx}',
      'packages/web/admin/tests/unit/**/*.test.{ts,tsx}',
      'packages/web/client/tests/unit/**/*.test.{ts,tsx}',
      'packages/web/public/tests/unit/**/*.test.{ts,tsx}',
    ],
    exclude: [...configDefaults.exclude],
    setupFiles: ['@kobato/test/setup/unit.ts'],
    testTimeout: 10_000,
  },
})
