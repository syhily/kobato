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
    // Cap worker processes: the default forks pool spawns one worker per CPU
    // core, which starves the host on high-core machines. (Project-level
    // option — the root config's maxWorkers is not inherited by projects.)
    maxWorkers: 4,
    environment: 'node',
    include: ['**/*.test.{ts,tsx}', '../arch/**/*.test.{ts,tsx}'],

    exclude: [...configDefaults.exclude, ...duckdbTestFilesUnder('apps/kobato/tests')],
    setupFiles: ['@kobato/test/setup/unit.ts'],
    testTimeout: 10_000,
  },
})
