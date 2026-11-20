import { mockIsolatedTestFiles } from '@kobato/test/mock-files.ts'
import { routeWarmupScriptStubPlugin } from '@kobato/test/virtual-modules.ts'
import { vitestTestBase } from '@kobato/test/vitest.base.ts'
import { testDefine } from '@kobato/test/vitest.define.ts'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const TESTS_ROOT = path.resolve(import.meta.dirname, '../it')
const MOCK_FILES = mockIsolatedTestFiles(TESTS_ROOT, REPO_ROOT)

export default defineConfig({
  root: REPO_ROOT,
  plugins: [routeWarmupScriptStubPlugin()],
  resolve: { tsconfigPaths: true },
  define: testDefine,
  test: {
    ...vitestTestBase,
    name: 'app-iso-it',
    isolate: true,
    include: MOCK_FILES,
    exclude: [...configDefaults.exclude],
    setupFiles: [path.resolve(import.meta.dirname, '../utils/setup/it.ts')],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
})
