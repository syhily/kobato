import { routeWarmupScriptStubPlugin } from '@kobato/test/virtual-modules.ts'
import { testDefine } from '@kobato/test/vitest.define.ts'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

// Umbrella root (see packages/web/tests/unit/vitest.config.ts): the project
// spans the umbrella's cross-leaf suites (packages/web/tests/snaps), the
// split-out admin leaf (packages/web/admin/tests/snaps), the split-out
// browser-platform leaf (packages/web/client/tests/snaps), and the split-out
// public leaf (packages/web/public/tests/snaps). The @kobato/test imports
// above still resolve from this file's own location (the umbrella tree links
// @kobato/test through the workspace).
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
    // Cap worker processes: the default forks pool spawns one worker per CPU
    // core, which starves the host on high-core machines. (Project-level
    // option — the root config's maxWorkers is not inherited by projects.)
    maxWorkers: 4,
    environment: 'node',
    include: [
      'packages/web/tests/snaps/**/*.test.{ts,tsx}',
      'packages/web/admin/tests/snaps/**/*.test.{ts,tsx}',
      'packages/web/client/tests/snaps/**/*.test.{ts,tsx}',
      'packages/web/public/tests/snaps/**/*.test.{ts,tsx}',
    ],
    exclude: [...configDefaults.exclude],
    // The project root is the repository root, whose package.json declares no
    // @kobato/test link — pin the file path ('@kobato/test/setup/snaps.ts'
    // through @kobato/test's exports map).
    setupFiles: ['@kobato/test/setup/snaps.ts'],
    testTimeout: 10_000,
  },
})
