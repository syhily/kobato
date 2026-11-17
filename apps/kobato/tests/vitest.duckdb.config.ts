import { DUCKDB_TEST_FILES } from '@kobato/test-helpers/duckdb-files.ts'
import { routeWarmupScriptStubPlugin } from '@kobato/test-helpers/virtual-modules.ts'
import { testDefine } from '@kobato/test-helpers/vitest.define.ts'
import { defineConfig } from 'vitest/config'

// The DuckDB native-engine suite: files that open a real sidecar (list owned by
// `@kobato/test-helpers/duckdb-files`). Files run sequentially, each in its own fresh fork, so a DuckDB
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
    // DUCKDB_TEST_FILES is repository-root relative; this config lives at
    // apps/kobato/tests, so rebase each path onto the config directory.
    include: DUCKDB_TEST_FILES.map((file) =>
      file.startsWith('apps/kobato/tests/') ? file.slice('apps/kobato/tests/'.length) : `../../${file}`,
    ),
    // Both trees are required: unit/setup (stubs + DOM cleanup) and it/setup
    // (in-memory SQLite env).
    setupFiles: ['@kobato/test-helpers/setup/unit.ts', '@kobato/test-helpers/setup/it.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    pool: 'forks',
    fileParallelism: false,
  },
})
