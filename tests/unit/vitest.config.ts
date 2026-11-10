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
    // Cap worker processes: the default forks pool spawns one worker per CPU
    // core, which starves the host on high-core machines. (Project-level
    // option — the root config's maxWorkers is not inherited by projects.)
    maxWorkers: 4,
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
    // DuckDB native-engine files run in the dedicated `duckdb` project.
    exclude: [...configDefaults.exclude, ...duckdbTestFilesUnder('unit')],
    setupFiles: ['./setup.ts'],
    testTimeout: 10_000,
  },
})
