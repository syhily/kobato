import { duckdbTestFilesUnder } from '@kobato/test-helpers/duckdb-files.ts'
import { routeWarmupScriptStubPlugin } from '@kobato/test-helpers/virtual-modules.ts'
import { testDefine } from '@kobato/test-helpers/vitest.define.ts'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [routeWarmupScriptStubPlugin()],
  resolve: { tsconfigPaths: true },
  define: testDefine,
  test: {
    name: 'server-it',
    globals: false,
    silent: 'passed-only',
    // Cap worker processes: the default forks pool spawns one worker per CPU
    // core, which starves the host on high-core machines.
    maxWorkers: 4,
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
    // DuckDB native-engine files run in the dedicated `duckdb` project.
    exclude: [...configDefaults.exclude, ...duckdbTestFilesUnder('packages/server/tests')],
    setupFiles: ['@kobato/test-helpers/setup/it.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
})
