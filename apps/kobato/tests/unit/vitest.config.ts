import { mockIsolatedTestFiles } from '@kobato/test/mock-files.ts'
import { vitestTestBase } from '@kobato/test/vitest.base.ts'
import { testDefine } from '@kobato/test/vitest.define.ts'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { configDefaults } from 'vitest/config'

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const TESTS_UNIT_ROOT = 'apps/kobato/tests/unit'
const MOCK_FILES = mockIsolatedTestFiles(path.resolve(import.meta.dirname), REPO_ROOT)
const SETUP_FILE = path.resolve(import.meta.dirname, '../utils/setup/unit.ts')

export const appUnitProjects = [
  {
    define: testDefine,
    test: {
      ...vitestTestBase,
      name: 'app-unit',
      include: [`${TESTS_UNIT_ROOT}/**/*.test.{ts,tsx}`, 'apps/kobato/tests/arch/**/*.test.{ts,tsx}'],
      exclude: [...configDefaults.exclude, ...MOCK_FILES],
      setupFiles: [SETUP_FILE],
    },
  },
  {
    define: testDefine,
    test: {
      ...vitestTestBase,
      name: 'app-iso-unit',
      isolate: true,
      include: MOCK_FILES,
      exclude: [...configDefaults.exclude],
      setupFiles: [SETUP_FILE],
    },
  },
]
