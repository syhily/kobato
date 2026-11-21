import { routeWarmupScriptStubPlugin } from '@kobato/test/virtual-modules'
import { vitestTestBase } from '@kobato/test/vitest.base'
import { testDefine } from '@kobato/test/vitest.define'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

export default defineConfig({
  root: REPO_ROOT,
  plugins: [routeWarmupScriptStubPlugin()],
  resolve: { tsconfigPaths: true },
  define: testDefine,
  test: {
    ...vitestTestBase,
    name: 'app-snaps',
    include: ['apps/kobato/tests/snaps/**/*.test.{ts,tsx}'],
    setupFiles: [path.resolve(import.meta.dirname, '../utils/setup/snaps.ts')],
  },
})
