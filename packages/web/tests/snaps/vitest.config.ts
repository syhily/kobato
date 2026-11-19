import { routeWarmupScriptStubPlugin } from '@kobato/test/virtual-modules.ts'
import { testDefine } from '@kobato/test/vitest.define.ts'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

export default defineConfig({
  root: REPO_ROOT,
  plugins: [routeWarmupScriptStubPlugin()],
  resolve: { tsconfigPaths: true },
  define: testDefine,
  test: {
    name: 'web-snaps',
    globals: false,
    silent: 'passed-only',
    maxWorkers: 4,
    environment: 'node',
    include: [
      'packages/web/tests/snaps/**/*.test.{ts,tsx}',
      'packages/web/admin/tests/snaps/**/*.test.{ts,tsx}',
      'packages/web/client/tests/snaps/**/*.test.{ts,tsx}',
      'packages/web/public/tests/snaps/**/*.test.{ts,tsx}',
    ],
    exclude: [...configDefaults.exclude],
    setupFiles: ['@kobato/test/setup/snaps.ts'],
    testTimeout: 10_000,
  },
})
