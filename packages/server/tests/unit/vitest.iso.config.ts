import { mockIsolatedTestFiles } from '@kobato/test/mock-files'
import { REPO_ROOT } from '@kobato/test/repo-root'
import { SHARED_UNSAFE_TEST_FILES } from '@kobato/test/shared-unsafe-files'
import { vitestTestBase } from '@kobato/test/vitest.base'
import { testDefine } from '@kobato/test/vitest.define'
import path from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'

const TESTS_UNIT_ROOT = 'packages/server/tests/unit'
const MOCK_FILES = mockIsolatedTestFiles(path.resolve(import.meta.dirname), REPO_ROOT)
const SHARED_UNSAFE_FILES = SHARED_UNSAFE_TEST_FILES.filter((file) => file.startsWith(`${TESTS_UNIT_ROOT}/`))
const SETUP_FILE = path.resolve(REPO_ROOT, 'packages/server/tests/utils/setup/unit.ts')

export default defineConfig({
  root: REPO_ROOT,
  resolve: {
    tsconfigPaths: true,
  },
  define: testDefine,
  test: {
    ...vitestTestBase,
    name: 'server-iso-unit',
    isolate: true,
    include: [...MOCK_FILES, ...SHARED_UNSAFE_FILES],
    exclude: [...configDefaults.exclude],
    setupFiles: [SETUP_FILE],
  },
})
