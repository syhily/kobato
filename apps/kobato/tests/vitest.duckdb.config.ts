import { DUCKDB_TEST_FILES } from '@kobato/test/duckdb-files.ts'
import { routeWarmupScriptStubPlugin } from '@kobato/test/virtual-modules.ts'
import { testDefine } from '@kobato/test/vitest.define.ts'
import { createRequire } from 'node:module'
import path from 'node:path'
import { defineConfig } from 'vitest/config'

const require = createRequire(import.meta.url)

// The DuckDB native-engine suite: files that open a real sidecar (list owned by
// `@kobato/test/duckdb-files`). Files run sequentially, each in its own fresh fork, so a DuckDB
// segfault kills only that file's worker and the failure is scoped to this project.
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
    // DUCKDB_TEST_FILES is repository-root relative.
    include: [...DUCKDB_TEST_FILES],
    // Both trees are required: unit/setup (stubs + DOM cleanup) and it/setup
    // (in-memory SQLite env).
    setupFiles: [require.resolve('@kobato/test/setup/unit.ts'), require.resolve('@kobato/test/setup/it.ts')],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    pool: 'forks',
    fileParallelism: false,
  },
})
