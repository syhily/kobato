import { duckdbTestFilesUnder } from '@kobato/test/duckdb-files.ts'
import { routeWarmupScriptStubPlugin } from '@kobato/test/virtual-modules.ts'
import { testDefine } from '@kobato/test/vitest.define.ts'
import path from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [routeWarmupScriptStubPlugin()],
  resolve: { tsconfigPaths: true },
  define: testDefine,
  test: {
    name: 'server-it',
    globals: false,
    silent: 'passed-only',
    maxWorkers: 4,
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
    exclude: [...configDefaults.exclude, ...duckdbTestFilesUnder('packages/server/tests')],
    setupFiles: [path.resolve(import.meta.dirname, '../utils/setup/it.ts')],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
})
