import { duckdbTestFilesUnder } from '@kobato/test/duckdb-files.ts'
import { mockIsolatedTestFiles } from '@kobato/test/mock-files.ts'
import { vitestTestBase } from '@kobato/test/vitest.base.ts'
import { testDefine } from '@kobato/test/vitest.define.ts'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const MOCK_FILES = mockIsolatedTestFiles(path.resolve(import.meta.dirname, '../unit'), REPO_ROOT).map((file) =>
  path.relative(path.resolve(import.meta.dirname, '../unit'), path.join(REPO_ROOT, file)),
)

export default defineConfig({
  resolve: { tsconfigPaths: true },
  define: testDefine,
  test: {
    ...vitestTestBase,
    name: 'app-unit',
    include: ['**/*.test.{ts,tsx}', '../arch/**/*.test.{ts,tsx}'],
    exclude: [...configDefaults.exclude, ...duckdbTestFilesUnder('apps/kobato/tests'), ...MOCK_FILES],
    setupFiles: [path.resolve(import.meta.dirname, '../utils/setup/unit.ts')],
  },
})
