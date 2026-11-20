import { duckdbTestFilesUnder } from '@kobato/test/duckdb-files.ts'
import { mockIsolatedTestFiles } from '@kobato/test/mock-files.ts'
import { SHARED_UNSAFE_TEST_FILES } from '@kobato/test/shared-unsafe-files.ts'
import { vitestTestBase } from '@kobato/test/vitest.base.ts'
import { testDefine } from '@kobato/test/vitest.define.ts'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const MOCK_FILES = mockIsolatedTestFiles(path.resolve(import.meta.dirname), REPO_ROOT).map((file) =>
  path.relative(path.resolve(import.meta.dirname), path.join(REPO_ROOT, file)),
)

export default defineConfig({
  resolve: { tsconfigPaths: true },
  define: testDefine,
  test: {
    ...vitestTestBase,
    name: 'server-unit',
    include: ['**/*.test.{ts,tsx}'],
    exclude: [
      ...configDefaults.exclude,
      ...duckdbTestFilesUnder('packages/server/tests'),
      ...MOCK_FILES,
      ...SHARED_UNSAFE_TEST_FILES.filter((file) => file.startsWith('packages/server/tests/unit/')).map((file) =>
        path.relative(path.resolve(import.meta.dirname), path.join(REPO_ROOT, file)),
      ),
    ],
    setupFiles: [path.resolve(import.meta.dirname, '../utils/setup/unit.ts')],
  },
})
