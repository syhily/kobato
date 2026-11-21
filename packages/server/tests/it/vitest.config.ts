import { duckdbTestFilesUnder } from '@kobato/test/duckdb-files'
import { mockIsolatedTestFiles } from '@kobato/test/mock-files'
import { REPO_ROOT } from '@kobato/test/repo-root'
import { SHARED_UNSAFE_TEST_FILES } from '@kobato/test/shared-unsafe-files'
import { vitestTestBase } from '@kobato/test/vitest.base'
import { testDefine } from '@kobato/test/vitest.define'
import path from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'

const TESTS_IT_ROOT = 'packages/server/tests/it'
const MOCK_FILES = mockIsolatedTestFiles(path.resolve(import.meta.dirname), REPO_ROOT)
const DUCKDB_FILES = duckdbTestFilesUnder('packages/server/tests')
const SHARED_UNSAFE_FILES = SHARED_UNSAFE_TEST_FILES.filter((file) => file.startsWith(`${TESTS_IT_ROOT}/`))
const SETUP_FILE = path.resolve(REPO_ROOT, 'packages/server/tests/utils/setup/it.ts')

export default defineConfig({
  root: REPO_ROOT,
  resolve: {
    tsconfigPaths: true,
  },
  define: testDefine,
  test: {
    ...vitestTestBase,
    name: 'server-it',
    include: [`${TESTS_IT_ROOT}/**/*.test.{ts,tsx}`],
    exclude: [...configDefaults.exclude, ...DUCKDB_FILES, ...MOCK_FILES, ...SHARED_UNSAFE_FILES],
    setupFiles: [SETUP_FILE],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
})
