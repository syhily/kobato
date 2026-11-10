import { defineConfig } from 'vitest/config'

import { routeWarmupScriptStubPlugin } from './_helpers/virtual-modules.ts'
import { DUCKDB_TEST_FILES } from './duckdb-files.ts'
import { testDefine } from './vitest.define.ts'

// The DuckDB native-engine suite: files that open a real sidecar (list owned by
// `./duckdb-files.ts`). Files run sequentially, each in its own fresh fork, so a DuckDB
// segfault kills only that file's worker and the failure is scoped to this project.
export default defineConfig({
  plugins: [routeWarmupScriptStubPlugin()],
  resolve: { tsconfigPaths: true },
  define: testDefine,
  test: {
    name: 'duckdb',
    globals: false,
    silent: 'passed-only',
    environment: 'node',
    include: [...DUCKDB_TEST_FILES],
    // Both trees are required: unit/setup (stubs + DOM cleanup) and it/setup
    // (in-memory SQLite env).
    setupFiles: ['./unit/setup.ts', './it/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    pool: 'forks',
    fileParallelism: false,
  },
})
