import { DUCKDB_TEST_FILES } from '@kobato/test/duckdb-files.ts'
import { routeWarmupScriptStubPlugin } from '@kobato/test/virtual-modules.ts'
import { vitestTestBase } from '@kobato/test/vitest.base.ts'
import { testDefine } from '@kobato/test/vitest.define.ts'
import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [routeWarmupScriptStubPlugin()],
  resolve: { tsconfigPaths: true },
  define: testDefine,
  test: {
    ...vitestTestBase,
    name: 'duckdb',
    // The list spans three packages' tests trees, so the project root must BE
    // the repository root for its include patterns to resolve (glob patterns
    // cannot climb above their root). Vitest resolves bare setup specifiers
    // against that root only, and @kobato/test links per-package — hence the
    // absolute paths below.
    root: path.resolve(import.meta.dirname, '../../..'),
    include: [...DUCKDB_TEST_FILES],
    setupFiles: [
      path.resolve(import.meta.dirname, 'utils/setup/unit.ts'),
      path.resolve(import.meta.dirname, 'utils/setup/it.ts'),
    ],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // The native engine is thread-safe and every file builds its own
    // throwaway DuckDB database under its own mkdtemp dir, and both setups
    // reset the shared analytics executor between files — so the files share
    // workers like every other project (16s → 11s on this suite).
    isolate: false,
  },
})
