import { duckdbTestFilesUnder } from '@kobato/test/duckdb-files.ts'
import { mockIsolatedTestFiles } from '@kobato/test/mock-files.ts'
import { routeWarmupScriptStubPlugin } from '@kobato/test/virtual-modules.ts'
import { vitestTestBase } from '@kobato/test/vitest.base.ts'
import { testDefine } from '@kobato/test/vitest.define.ts'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { configDefaults } from 'vitest/config'

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const TESTS_IT_ROOT = 'apps/kobato/tests/it'
const MOCK_FILES = mockIsolatedTestFiles(path.resolve(import.meta.dirname), REPO_ROOT)
const DUCKDB_FILES = duckdbTestFilesUnder('apps/kobato/tests').map((file) => `${TESTS_IT_ROOT}/${file}`)
const SETUP_FILE = path.resolve(import.meta.dirname, '../utils/setup/it.ts')

export const appItProjects = [
  {
    plugins: [routeWarmupScriptStubPlugin()],
    define: testDefine,
    test: {
      ...vitestTestBase,
      name: 'app-it',
      include: [`${TESTS_IT_ROOT}/**/*.test.{ts,tsx}`],
      exclude: [...configDefaults.exclude, ...DUCKDB_FILES, ...MOCK_FILES],
      setupFiles: [SETUP_FILE],
      testTimeout: 30_000,
      hookTimeout: 120_000,
    },
  },
  {
    plugins: [routeWarmupScriptStubPlugin()],
    define: testDefine,
    test: {
      ...vitestTestBase,
      name: 'app-iso-it',
      isolate: true,
      include: MOCK_FILES,
      exclude: [...configDefaults.exclude],
      setupFiles: [SETUP_FILE],
      testTimeout: 30_000,
      hookTimeout: 120_000,
    },
  },
]
