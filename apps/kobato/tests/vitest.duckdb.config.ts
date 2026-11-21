import { DUCKDB_TEST_FILES } from '@kobato/test/duckdb-files'
import { REPO_ROOT } from '@kobato/test/repo-root'
import { routeWarmupScriptStubPlugin } from '@kobato/test/virtual-modules'
import { vitestTestBase } from '@kobato/test/vitest.base'
import { testDefine } from '@kobato/test/vitest.define'
import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [routeWarmupScriptStubPlugin()],
  resolve: { tsconfigPaths: true },
  define: testDefine,
  test: {
    ...vitestTestBase,
    name: 'duckdb',
    root: REPO_ROOT,
    include: [...DUCKDB_TEST_FILES],
    setupFiles: [
      path.resolve(REPO_ROOT, 'apps/kobato/tests/utils/setup/unit.ts'),
      path.resolve(REPO_ROOT, 'apps/kobato/tests/utils/setup/it.ts'),
    ],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    isolate: false,
  },
})
