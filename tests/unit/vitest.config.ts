import { configDefaults, defineConfig } from 'vitest/config'

import { duckdbTestFilesUnder } from '../duckdb-files.ts'
import { testDefine } from '../vitest.define.ts'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  define: testDefine,
  test: {
    globals: false,
    silent: 'passed-only',
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
    // DuckDB native-engine files run in the dedicated `duckdb` project.
    exclude: [...configDefaults.exclude, ...duckdbTestFilesUnder('unit')],
    setupFiles: ['./setup.ts'],
    testTimeout: 10_000,
  },
})
