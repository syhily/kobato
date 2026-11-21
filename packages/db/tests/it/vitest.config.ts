import { duckdbTestFilesUnder } from '@kobato/test/duckdb-files'
import { vitestTestBase } from '@kobato/test/vitest.base'
import { testDefine } from '@kobato/test/vitest.define'
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
    name: 'db-it',
    include: ['packages/db/tests/it/**/*.test.{ts,tsx}'],
    exclude: [...configDefaults.exclude, ...DUCKDB_FILES],
    setupFiles: [path.resolve(import.meta.dirname, '../utils/setup/it.ts')],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
})
