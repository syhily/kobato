import { duckdbTestFilesUnder } from '@kobato/test/duckdb-files.ts'
import { testDefine } from '@kobato/test/vitest.define.ts'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  define: testDefine,
  test: {
    name: 'app-unit',
    globals: false,
    silent: 'passed-only',
    maxWorkers: 4,
    environment: 'node',
    include: ['**/*.test.{ts,tsx}', '../arch/**/*.test.{ts,tsx}'],

    exclude: [...configDefaults.exclude, ...duckdbTestFilesUnder('apps/kobato/tests')],
    setupFiles: ['@kobato/test/setup/unit.ts'],
    testTimeout: 10_000,
  },
})
