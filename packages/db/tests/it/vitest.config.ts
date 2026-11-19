import { duckdbTestFilesUnder } from '@kobato/test/duckdb-files.ts'
import { testDefine } from '@kobato/test/vitest.define.ts'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  define: testDefine,
  test: {
    name: 'db-it',
    globals: false,
    silent: 'passed-only',
    maxWorkers: 4,
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
    exclude: [...configDefaults.exclude, ...duckdbTestFilesUnder('packages/db/tests')],
    setupFiles: ['@kobato/test/setup/it.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
})
