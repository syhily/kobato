import { duckdbTestFilesUnder } from '@kobato/test/duckdb-files.ts'
import { mockIsolatedTestFiles } from '@kobato/test/mock-files.ts'
import { routeWarmupScriptStubPlugin } from '@kobato/test/virtual-modules.ts'
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
  plugins: [routeWarmupScriptStubPlugin()],
  resolve: { tsconfigPaths: true },
  define: testDefine,
  test: {
    ...vitestTestBase,
    name: 'app-it',
    include: ['**/*.test.{ts,tsx}'],
    exclude: [...configDefaults.exclude, ...duckdbTestFilesUnder('apps/kobato/tests'), ...MOCK_FILES],
    setupFiles: [path.resolve(import.meta.dirname, '../utils/setup/it.ts')],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
})
