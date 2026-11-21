import { mockIsolatedTestFiles } from '@kobato/test/mock-files'
import { vitestTestBase } from '@kobato/test/vitest.base'
import { testDefine } from '@kobato/test/vitest.define'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const TESTS_UNIT_ROOT = 'apps/kobato/tests/unit'
const MOCK_FILES = mockIsolatedTestFiles(path.resolve(import.meta.dirname), REPO_ROOT)
const SETUP_FILE = path.resolve(import.meta.dirname, '../utils/setup/unit.ts')

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
