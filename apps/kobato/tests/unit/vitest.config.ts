import { mockIsolatedTestFiles } from '@kobato/test/mock-files'
import { REPO_ROOT } from '@kobato/test/repo-root'
import { vitestTestBase } from '@kobato/test/vitest.base'
import { testDefine } from '@kobato/test/vitest.define'
import path from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'

const TESTS_UNIT_ROOT = 'apps/kobato/tests/unit'
const MOCK_FILES = mockIsolatedTestFiles(path.resolve(import.meta.dirname), REPO_ROOT)
const SETUP_FILE = path.resolve(REPO_ROOT, 'apps/kobato/tests/utils/setup/unit.ts')

export default defineConfig({
  root: REPO_ROOT,
  resolve: {
    tsconfigPaths: true,
  },
  define: testDefine,
  test: {
    ...vitestTestBase,
    name: 'app-unit',
    include: [`${TESTS_UNIT_ROOT}/**/*.test.{ts,tsx}`, 'apps/kobato/tests/arch/**/*.test.{ts,tsx}'],
    exclude: [...configDefaults.exclude, ...MOCK_FILES],
    setupFiles: [SETUP_FILE],
  },
})
