import { duckdbTestFilesUnder } from '@kobato/test/duckdb-files.ts'
import { mockIsolatedTestFiles } from '@kobato/test/mock-files.ts'
import { SHARED_UNSAFE_TEST_FILES } from '@kobato/test/shared-unsafe-files.ts'
import { vitestTestBase } from '@kobato/test/vitest.base.ts'
import { testDefine } from '@kobato/test/vitest.define.ts'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { configDefaults } from 'vitest/config'

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const TESTS_IT_ROOT = 'packages/server/tests/it'
const MOCK_FILES = mockIsolatedTestFiles(path.resolve(import.meta.dirname), REPO_ROOT)
const DUCKDB_FILES = duckdbTestFilesUnder('packages/server/tests').map((file) => `${TESTS_IT_ROOT}/${file}`)
const SHARED_UNSAFE_FILES = SHARED_UNSAFE_TEST_FILES.filter((file) => file.startsWith(`${TESTS_IT_ROOT}/`))
const SETUP_FILE = path.resolve(import.meta.dirname, '../utils/setup/it.ts')

export const serverItProjects = [
  {
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
  },
  {
    define: testDefine,
    test: {
      ...vitestTestBase,
      name: 'server-iso-it',
      isolate: true,
      include: [...MOCK_FILES, ...SHARED_UNSAFE_FILES],
      exclude: [...configDefaults.exclude],
      setupFiles: [SETUP_FILE],
      testTimeout: 30_000,
      hookTimeout: 120_000,
    },
  },
]
