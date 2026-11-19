import { testDefine } from '@kobato/test/vitest.define.ts'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

// This file sits at packages/web/tests/unit, but the project it owns spans
// FOUR trees: the umbrella's cross-leaf suites (packages/web/tests/unit +
// contract), the split-out admin leaf (packages/web/admin/tests/unit), the
// split-out browser-platform leaf (packages/web/client/tests/unit), and the
// split-out public leaf (packages/web/public/tests/unit). Anchor the project
// at the repository root so one include set covers all; the @kobato/test
// import above still resolves from this file's own location (the umbrella
// tree links @kobato/test through the workspace).
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

export default defineConfig({
  root: REPO_ROOT,
  resolve: {
    tsconfigPaths: true,
  },
  define: testDefine,
  test: {
    name: 'web-unit',
    globals: false,
    silent: 'passed-only',
    // Cap worker processes: the default forks pool spawns one worker per CPU
    // core, which starves the host on high-core machines. (Project-level
    // option — the root config's maxWorkers is not inherited by projects.)
    maxWorkers: 4,
    environment: 'node',
    include: [
      'packages/web/tests/unit/**/*.test.{ts,tsx}',
      'packages/web/tests/contract/**/*.test.{ts,tsx}',
      'packages/web/admin/tests/unit/**/*.test.{ts,tsx}',
      'packages/web/client/tests/unit/**/*.test.{ts,tsx}',
      'packages/web/public/tests/unit/**/*.test.{ts,tsx}',
    ],
    exclude: [...configDefaults.exclude],
    // The project root is the repository root, whose package.json declares no
    // @kobato/test link — pin the file path ('@kobato/test/setup/unit.ts'
    // through @kobato/test's exports map).
    setupFiles: ['@kobato/test/setup/unit.ts'],
    testTimeout: 10_000,
  },
})
