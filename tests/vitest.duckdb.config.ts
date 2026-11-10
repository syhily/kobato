import { defineConfig } from 'vitest/config'

import { routeWarmupScriptStubPlugin } from './_helpers/virtual-modules.ts'
import { DUCKDB_TEST_FILES } from './duckdb-files.ts'
import { testDefine } from './vitest.define.ts'

// The DuckDB native-engine suite: files that open a real sidecar (list owned
// by `./duckdb-files.ts`, pinned by tests/unit/arch/duckdb-project-files.test.ts).
// Files run sequentially, each in its own fresh fork — a DuckDB segfault then
// kills only that file's worker instead of a worker shared with other files,
// and the failure is scoped to this project in the report.
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
    // Members come from both trees: unit/setup (stubs + DOM cleanup) and
    // it/setup (in-memory SQLite env) are both required, and neither
    // conflicts with the other.
    setupFiles: ['./unit/setup.ts', './it/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    pool: 'forks',
    fileParallelism: false,
  },
})
