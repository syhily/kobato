import { testDefine } from '@kobato/test/vitest.define.ts'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

export default defineConfig({
  root: REPO_ROOT,
  resolve: {
    tsconfigPaths: true,
  },
  define: testDefine,
  test: {
    name: 'shared-snaps',
    globals: false,
    silent: 'passed-only',
    maxWorkers: 4,
    environment: 'node',
    include: [
      'packages/shared/{utils,i18n,cache,auth,catalog,settings,assets,lexical,sanitize,contracts,telemetry,distribution,seo}/tests/snaps/**/*.test.{ts,tsx}',
    ],
    setupFiles: ['@kobato/test/setup/snaps.ts'],
    testTimeout: 10_000,
  },
})
