import { mockIsolatedTestFiles } from '@kobato/test/mock-files'
import { REPO_ROOT } from '@kobato/test/repo-root'
import { routeWarmupScriptStubPlugin } from '@kobato/test/virtual-modules'
import { vitestTestBase } from '@kobato/test/vitest.base'
import { testDefine } from '@kobato/test/vitest.define'
import path from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'

const MOCK_FILES = mockIsolatedTestFiles(path.resolve(import.meta.dirname), REPO_ROOT)
const SETUP_FILE = path.resolve(REPO_ROOT, 'apps/kobato/tests/utils/setup/it.ts')

export default defineConfig({
  root: REPO_ROOT,
  resolve: {
    tsconfigPaths: true,
  },
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
})
