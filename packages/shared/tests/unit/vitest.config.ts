import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

import { testDefine } from '../../../../tools/test/src/vitest.define.ts'

// This file sits four levels below the repository root
// (packages/shared/tests/unit) while the suites it owns span the thirteen split
// leaf packages' trees (packages/shared/{utils,i18n,...}/tests/unit) — anchor
// at the repo root. The @kobato/test imports above are relative file paths:
// with packages/shared no longer a workspace package, the bare specifiers
// would not resolve from here.
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

export default defineConfig({
  root: REPO_ROOT,
  resolve: {
    tsconfigPaths: true,
  },
  define: testDefine,
  test: {
    name: 'shared-unit',
    globals: false,
    silent: 'passed-only',
    // Cap worker processes: the default forks pool spawns one worker per CPU
    // core, which starves the host on high-core machines. (Project-level
    // option — the root config's maxWorkers is not inherited by projects.)
    maxWorkers: 4,
    environment: 'node',
    include: [
      'packages/shared/{utils,i18n,cache,auth,catalog,settings,assets,lexical,sanitize,contracts,telemetry,distribution,seo}/tests/unit/**/*.test.{ts,tsx}',
    ],
    exclude: [...configDefaults.exclude],
    // Package specifiers don't resolve from the repo root (the root
    // package.json declares no @kobato/test link), so pin the file path —
    // '@kobato/test/setup/unit.ts' through @kobato/test's exports map.
    setupFiles: ['tools/test/src/setup/unit.ts'],
    testTimeout: 10_000,
  },
})
