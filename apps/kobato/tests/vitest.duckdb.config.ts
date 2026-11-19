import { DUCKDB_TEST_FILES } from '@kobato/test/duckdb-files.ts'
import { routeWarmupScriptStubPlugin } from '@kobato/test/virtual-modules.ts'
import { testDefine } from '@kobato/test/vitest.define.ts'
import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [routeWarmupScriptStubPlugin()],
  resolve: { tsconfigPaths: true },
  define: testDefine,
  test: {
    name: 'duckdb',
    // The list spans three packages' tests trees, so the project root must BE
    // the repository root for its include patterns to resolve (glob patterns
    // cannot climb above their root). Vitest resolves bare setup specifiers
    // against that root only, and @kobato/test links per-package — hence the
    // absolute paths below.
    root: path.resolve(import.meta.dirname, '../../..'),
    globals: false,
    silent: 'passed-only',
    environment: 'node',

    include: [...DUCKDB_TEST_FILES],
    setupFiles: [
      path.resolve(import.meta.dirname, 'utils/setup/unit.ts'),
      path.resolve(import.meta.dirname, 'utils/setup/it.ts'),
    ],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    pool: 'forks',
    fileParallelism: false,
  },
})
