import { duckdbTestFilesUnder } from '@kobato/test/duckdb-files.ts'
import { vitestTestBase } from '@kobato/test/vitest.base.ts'
import { testDefine } from '@kobato/test/vitest.define.ts'
import path from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  define: testDefine,
  test: {
    ...vitestTestBase,
    name: 'db-it',
    include: ['**/*.test.{ts,tsx}'],
    exclude: [...configDefaults.exclude, ...duckdbTestFilesUnder('packages/db/tests')],
    setupFiles: [path.resolve(import.meta.dirname, '../utils/setup/it.ts')],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
})
