import { vitestTestBase } from '@kobato/test/vitest.base.ts'
import { testDefine } from '@kobato/test/vitest.define.ts'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

// Anchored at the REPOSITORY ROOT: the sea contract tests read the INSTALLED
// packages through `process.cwd()`-relative resolution (`node_modules/<name>`,
// `package.json`), so the suite must run with the repo root as cwd — the same
// contract shared-unit / server-unit pin. Filters resolve against the repo root.
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

export default defineConfig({
  root: REPO_ROOT,
  resolve: {
    tsconfigPaths: true,
  },
  define: testDefine,
  test: {
    ...vitestTestBase,
    name: 'pack-unit',
    include: ['tools/pack/tests/unit/**/*.test.{ts,tsx}'],
    exclude: [...configDefaults.exclude],
  },
})
