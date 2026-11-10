import { configDefaults, defineConfig } from 'vitest/config'

import { routeWarmupScriptStubPlugin } from '../_helpers/virtual-modules.ts'
import { duckdbTestFilesUnder } from '../duckdb-files.ts'
import { testDefine } from '../vitest.define.ts'

export default defineConfig({
  plugins: [routeWarmupScriptStubPlugin()],
  resolve: { tsconfigPaths: true },
  define: testDefine,
  test: {
    globals: false,
    silent: 'passed-only',
    // Cap worker processes: the default forks pool spawns one worker per CPU
    // core, which starves the host on high-core machines.
    maxWorkers: 4,
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
    // DuckDB native-engine files run in the dedicated `duckdb` project.
    exclude: [...configDefaults.exclude, ...duckdbTestFilesUnder('it')],
    setupFiles: ['./setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
})
