import { REPO_ROOT } from '@kobato/test/repo-root'
import { routeWarmupScriptStubPlugin } from '@kobato/test/virtual-modules'
import { vitestTestBase } from '@kobato/test/vitest.base'
import { testDefine } from '@kobato/test/vitest.define'
import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: REPO_ROOT,
  plugins: [routeWarmupScriptStubPlugin()],
  resolve: { tsconfigPaths: true },
  define: testDefine,
  test: {
    ...vitestTestBase,
    name: 'ui-snaps',
    include: ['packages/ui/tests/snaps/**/*.test.{ts,tsx}'],
    setupFiles: [path.resolve(REPO_ROOT, 'packages/ui/tests/utils/setup/snaps.ts')],
  },
})
