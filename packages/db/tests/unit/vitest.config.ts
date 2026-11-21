import { duckdbTestFilesUnder } from '@kobato/test/duckdb-files.ts'
import { vitestTestBase } from '@kobato/test/vitest.base.ts'
import { testDefine } from '@kobato/test/vitest.define.ts'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const DUCKDB_FILES = duckdbTestFilesUnder('packages/db/tests')

export default defineConfig({
  root: REPO_ROOT,
  resolve: { tsconfigPaths: true },
  define: testDefine,
  test: {
    ...vitestTestBase,
    name: 'db-unit',
    include: ['packages/db/tests/unit/**/*.test.{ts,tsx}'],
    exclude: [...configDefaults.exclude, ...DUCKDB_FILES],
    setupFiles: [path.resolve(import.meta.dirname, '../utils/setup/unit.ts')],
  },
})
