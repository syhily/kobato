import { duckdbTestFilesUnder } from '@kobato/test/duckdb-files.ts'
import { testDefine } from '@kobato/test/vitest.define.ts'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  define: testDefine,
  test: {
    name: 'db-unit',
    globals: false,
    silent: 'passed-only',
    maxWorkers: 4,
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
    // DuckDB native-engine files run in the dedicated `duckdb` project.
    exclude: [...configDefaults.exclude, ...duckdbTestFilesUnder('packages/db/tests')],
    setupFiles: ['@kobato/test/setup/unit.ts'],
    testTimeout: 10_000,
  },
})
