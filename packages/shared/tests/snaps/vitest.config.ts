import { testDefine } from '@kobato/test/vitest.define.ts'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// This file sits four levels below the repository root
// (packages/shared/tests/snaps) while the suites it owns span the thirteen split
// leaf packages' trees (packages/shared/{utils,i18n,...}/tests/snaps) — anchor
// at the repo root. The @kobato/test import above is a relative file path:
// with packages/shared no longer a workspace package, the bare specifier
// would not resolve from here.
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
    // Cap worker processes: the default forks pool spawns one worker per CPU
    // core, which starves the host on high-core machines.
    maxWorkers: 4,
    environment: 'node',
    include: [
      'packages/shared/{utils,i18n,cache,auth,catalog,settings,assets,lexical,sanitize,contracts,telemetry,distribution,seo}/tests/snaps/**/*.test.{ts,tsx}',
    ],
    // Package specifiers don't resolve from the repo root (the root
    // package.json declares no @kobato/test link), so pin the file path —
    // '@kobato/test/setup/snaps.ts' through @kobato/test's exports map.
    setupFiles: ['@kobato/test/setup/snaps.ts'],
    testTimeout: 10_000,
  },
})
