import { mockIsolatedTestFiles } from '@kobato/test/mock-files'
import { SHARED_UNSAFE_TEST_FILES } from '@kobato/test/shared-unsafe-files'
import { vitestTestBase } from '@kobato/test/vitest.base'
import { testDefine } from '@kobato/test/vitest.define'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const TESTS_UNIT_ROOT = 'packages/server/tests/unit'
const MOCK_FILES = mockIsolatedTestFiles(path.resolve(import.meta.dirname), REPO_ROOT)
const SHARED_UNSAFE_FILES = SHARED_UNSAFE_TEST_FILES.filter((file) => file.startsWith(`${TESTS_UNIT_ROOT}/`))
const SETUP_FILE = path.resolve(import.meta.dirname, '../utils/setup/unit.ts')

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
